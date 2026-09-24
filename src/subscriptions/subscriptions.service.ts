import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Subscription, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { AdminCreatePlanDto, AdminUpdatePlanDto } from './dto/admin-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { SubscriptionStatusResponseDto } from './dto/subscription-status-response.dto';
import { calculateNextPeriodEnd } from './utils/billing-period.util';

export type SubscriptionWithPlan = Subscription & {
  plan: SubscriptionPlan;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
  ) {}

  /**
   * Retrieves all active subscription plans for user presentation.
   */
  async getActivePlans(): Promise<PlanResponseDto[]> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
    return plans.map((p) => this.toSafePlan(p));
  }

  /**
   * Retrieves all subscription plans including inactive tiers (Admin only).
   */
  async getAllPlans(): Promise<PlanResponseDto[]> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return plans.map((p) => this.toSafePlan(p));
  }

  /**
   * Finds an active plan by slug.
   */
  async getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
    return this.prisma.subscriptionPlan.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });
  }

  /**
   * Resolves the user's effective active subscription.
   * If no active subscription exists, automatically provisions a FREE subscription.
   * Automatically handles billing period rollover and scheduled cancellations.
   */
  async getCurrentSubscription(userId: string): Promise<SubscriptionWithPlan> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let activeSub = subscription;
    if (!activeSub) {
      activeSub = await this.createDefaultFreeSubscription(userId);
    }

    const now = new Date();

    // Check if the current billing cycle has expired
    if (now >= activeSub.currentPeriodEnd) {
      if (activeSub.canceledAt !== null) {
        const subToCancel = activeSub;
        // Scheduled cancellation period has finished — transition to CANCELED and provision Free
        activeSub = await this.prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: subToCancel.id },
            data: {
              status: SubscriptionStatus.CANCELED,
              endDate: subToCancel.currentPeriodEnd,
            },
          });

          const freePlan = await tx.subscriptionPlan.findUnique({
            where: { slug: 'free' },
          });

          if (!freePlan) {
            throw new InternalServerErrorException('Default FREE plan is not configured');
          }

          const currentPeriodEnd = calculateNextPeriodEnd(now, freePlan.billingCycle);

          return tx.subscription.create({
            data: {
              userId,
              planId: freePlan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: now,
              currentPeriodStart: now,
              currentPeriodEnd,
            },
            include: {
              plan: true,
            },
          });
        });
      } else {
        // Active subscription rollover into new cycle
        const newPeriodStart = activeSub.currentPeriodEnd;
        const newPeriodEnd = calculateNextPeriodEnd(newPeriodStart, activeSub.plan.billingCycle);

        activeSub = await this.prisma.subscription.update({
          where: { id: activeSub.id },
          data: {
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
          },
          include: {
            plan: true,
          },
        });
      }
    }

    return activeSub;
  }

  /**
   * Computes dynamic subscription status, request limits, and usage metrics.
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResponseDto> {
    const subscription = await this.getCurrentSubscription(userId);
    const usage = await this.usageService.getUsageCount(
      userId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );

    const requestLimit = subscription.plan.requestLimit;
    const isUnlimited = requestLimit === null;
    const remainingRequests = isUnlimited ? null : Math.max(0, requestLimit - usage);
    const usagePercentage =
      isUnlimited || requestLimit === 0
        ? 0
        : Math.min(100, Math.round((usage / requestLimit) * 1000) / 10);

    return {
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        requestLimit: subscription.plan.requestLimit,
      },
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      usage,
      remainingRequests,
      isUnlimited,
      usagePercentage,
      canceledAt: subscription.canceledAt,
    };
  }

  /**
   * Enforces subscription request limit.
   * Reusable by future Chat, AI, and Search modules.
   * Throws HTTP 429 Too Many Requests when usage quota is exceeded.
   */
  async checkRequestAllowance(userId: string): Promise<{
    allowed: boolean;
    remainingRequests: number | null;
    plan: { id: string; name: string; slug: string };
  }> {
    const status = await this.getSubscriptionStatus(userId);

    if (
      !status.isUnlimited &&
      (status.remainingRequests === 0 || status.usage >= (status.plan.requestLimit ?? 0))
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Monthly request limit reached for your current subscription plan. Please upgrade to continue.',
          error: 'Too Many Requests',
          code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      allowed: true,
      remainingRequests: status.remainingRequests,
      plan: {
        id: status.plan.id,
        name: status.plan.name,
        slug: status.plan.slug,
      },
    };
  }

  /**
   * Upgrades authenticated user to target plan in a transaction.
   */
  async upgrade(userId: string, planSlug: string): Promise<SubscriptionResponseDto> {
    const slug = planSlug.trim().toLowerCase();
    const targetPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug },
    });

    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('Target subscription plan not found or is inactive');
    }

    const currentSub = await this.getCurrentSubscription(userId);

    // Same plan already active with no pending cancellation
    if (
      currentSub.plan.slug === slug &&
      currentSub.status === SubscriptionStatus.ACTIVE &&
      currentSub.canceledAt === null
    ) {
      throw new ConflictException('User is already actively subscribed to this plan');
    }

    // Same plan with a scheduled downgrade — cancel the pending downgrade (reactivate)
    if (
      currentSub.plan.slug === slug &&
      currentSub.status === SubscriptionStatus.ACTIVE &&
      currentSub.canceledAt !== null
    ) {
      const restored = await this.prisma.subscription.update({
        where: { id: currentSub.id },
        data: {
          canceledAt: null,
          endDate: null,
        },
        include: {
          plan: true,
        },
      });
      return this.toSafeSubscription(restored);
    }

    if (!this.isHigherPlan(targetPlan, currentSub.plan)) {
      throw new BadRequestException(
        'Target plan must be a higher tier than the current subscription. Use downgrade for lower tiers.',
      );
    }

    const now = new Date();
    const currentPeriodEnd = calculateNextPeriodEnd(now, targetPlan.billingCycle);

    const newSubscription = await this.prisma.$transaction(async (tx) => {
      // Invalidate current active subscription to satisfy partial unique index
      if (currentSub.status === SubscriptionStatus.ACTIVE) {
        await tx.subscription.update({
          where: { id: currentSub.id },
          data: {
            status: SubscriptionStatus.CANCELED,
            endDate: now,
            canceledAt: now,
          },
        });
      }

      return tx.subscription.create({
        data: {
          userId,
          planId: targetPlan.id,
          status: SubscriptionStatus.ACTIVE,
          startDate: now,
          currentPeriodStart: now,
          currentPeriodEnd,
        },
        include: {
          plan: true,
        },
      });
    });

    return this.toSafeSubscription(newSubscription);
  }

  /**
   * Downgrades authenticated user to target plan.
   * If on a paid plan, marks canceledAt for end-of-period downgrade.
   */
  async downgrade(userId: string, planSlug: string): Promise<SubscriptionResponseDto> {
    const slug = planSlug.trim().toLowerCase();
    const targetPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug },
    });

    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('Target subscription plan not found or is inactive');
    }

    const currentSub = await this.getCurrentSubscription(userId);

    if (currentSub.plan.slug === slug) {
      throw new BadRequestException('User is already on this subscription plan');
    }

    if (!this.isHigherPlan(currentSub.plan, targetPlan)) {
      throw new BadRequestException(
        'Target plan must be a lower tier than the current subscription. Use upgrade for higher tiers.',
      );
    }

    if (currentSub.canceledAt !== null) {
      throw new ConflictException(
        'Subscription is already scheduled for downgrade at the end of the current billing cycle',
      );
    }

    // Schedule downgrade at the end of current cycle
    const updatedSub = await this.prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        canceledAt: new Date(),
        endDate: currentSub.currentPeriodEnd,
      },
      include: {
        plan: true,
      },
    });

    return this.toSafeSubscription(updatedSub);
  }

  /**
   * Creates a default FREE tier subscription for a user.
   */
  async createDefaultFreeSubscription(userId: string): Promise<SubscriptionWithPlan> {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: 'free' },
    });

    if (!freePlan) {
      throw new InternalServerErrorException('Default FREE plan is not configured');
    }

    const now = new Date();
    const currentPeriodEnd = calculateNextPeriodEnd(now, freePlan.billingCycle);

    try {
      return await this.prisma.subscription.create({
        data: {
          userId,
          planId: freePlan.id,
          status: SubscriptionStatus.ACTIVE,
          startDate: now,
          currentPeriodStart: now,
          currentPeriodEnd,
        },
        include: {
          plan: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.subscription.findFirst({
          where: { userId, status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  // ==========================================
  // ADMIN SUBSCRIPTION MANAGEMENT
  // ==========================================

  /**
   * Creates a new subscription plan (Admin only).
   */
  async adminCreatePlan(dto: AdminCreatePlanDto): Promise<PlanResponseDto> {
    const existing = await this.prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ name: dto.name }, { slug: dto.slug }],
      },
    });

    if (existing) {
      throw new ConflictException('A subscription plan with this name or slug already exists');
    }

    const created = await this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        price: new Prisma.Decimal(dto.price ?? 0),
        currency: dto.currency ?? 'USD',
        billingCycle: dto.billingCycle ?? 'monthly',
        requestLimit: dto.requestLimit ?? null,
        features: (dto.features as Prisma.InputJsonValue) ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.toSafePlan(created);
  }

  /**
   * Updates an existing subscription plan (Admin only).
   */
  async adminUpdatePlan(id: string, dto: AdminUpdatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
        currency: dto.currency ?? undefined,
        billingCycle: dto.billingCycle ?? undefined,
        requestLimit: dto.requestLimit !== undefined ? dto.requestLimit : undefined,
        features: dto.features !== undefined ? (dto.features as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });

    return this.toSafePlan(updated);
  }

  /**
   * Lists subscriptions with pagination and optional filters (Admin only).
   */
  async adminGetSubscriptions(
    page = 1,
    limit = 20,
    filters?: {
      status?: SubscriptionStatus;
      planId?: string;
      userId?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.SubscriptionWhereInput = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.planId ? { planId: filters.planId } : {}),
      ...(filters?.userId ? { userId: filters.userId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        include: {
          plan: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      items: items.map((sub) => ({
        ...this.toSafeSubscription(sub),
        user: sub.user,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Returns a single subscription with user summary (Admin only).
   */
  async adminGetSubscriptionById(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        },
      },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return {
      ...this.toSafeSubscription(sub),
      user: sub.user,
    };
  }

  /**
   * Updates subscription lifecycle status directly (Admin only).
   */
  async adminUpdateSubscriptionStatus(
    id: string,
    status: SubscriptionStatus,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.ACTIVE) {
        await tx.subscription.updateMany({
          where: {
            userId: sub.userId,
            status: SubscriptionStatus.ACTIVE,
            id: { not: id },
          },
          data: {
            status: SubscriptionStatus.CANCELED,
            canceledAt: new Date(),
            endDate: new Date(),
          },
        });
      }

      return tx.subscription.update({
        where: { id },
        data: { status },
        include: { plan: true },
      });
    });

    return this.toSafeSubscription(updated);
  }

  // ==========================================
  // SERIALIZERS
  // ==========================================

  /**
   * Compares plan rank using price, then requestLimit (null = unlimited).
   */
  private isHigherPlan(candidate: SubscriptionPlan, baseline: SubscriptionPlan): boolean {
    const candidateLimit = candidate.requestLimit ?? Number.MAX_SAFE_INTEGER;
    const baselineLimit = baseline.requestLimit ?? Number.MAX_SAFE_INTEGER;
    const candidatePrice = Number(candidate.price);
    const baselinePrice = Number(baseline.price);

    if (candidatePrice !== baselinePrice) {
      return candidatePrice > baselinePrice;
    }

    return candidateLimit > baselineLimit;
  }

  toSafePlan(plan: SubscriptionPlan): PlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price.toString(),
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      requestLimit: plan.requestLimit,
      features: (plan.features as Record<string, unknown>) ?? null,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
    };
  }

  toSafeSubscription(sub: SubscriptionWithPlan): SubscriptionResponseDto {
    return {
      id: sub.id,
      status: sub.status,
      plan: this.toSafePlan(sub.plan),
      startDate: sub.startDate,
      endDate: sub.endDate,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
    };
  }
}
