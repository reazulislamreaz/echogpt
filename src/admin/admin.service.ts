import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoleType } from '../roles/enums/role.enum';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import {
  AdminDashboardStatsDto,
  AdminSystemHealthDto,
  AdminUsageAnalyticsDto,
  AdminUsageLogItemDto,
  PaginatedAdminUsageLogsDto,
} from './dto/admin-dashboard.dto';
import {
  AdminUserDetailDto,
  AdminUserUsageSummaryDto,
  PaginatedAdminUsersDto,
} from './dto/admin-user-detail.dto';
import { AdminUserQueryDto, AdminUserSortField, SortDirection } from './dto/admin-user-query.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStatsDto> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      verifiedUsers,
      unverifiedUsers,
      recentlyRegistered,
      totalSubscriptions,
      activeSubscriptions,
      canceledSubscriptions,
      expiredSubscriptions,
      pastDueSubscriptions,
      trialingSubscriptions,
      freeActive,
      premiumActive,
      totalProviders,
      activeProviders,
      defaultProvider,
      totalConversations,
      totalMessages,
      totalWebSearches,
      totalApiRequests,
      successfulApiRequests,
      failedApiRequests,
      tokenAggregate,
      last30DaysRequests,
      databaseUp,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.user.count({ where: { isActive: false, deletedAt: null } }),
      this.prisma.user.count({ where: { isEmailVerified: true, deletedAt: null } }),
      this.prisma.user.count({ where: { isEmailVerified: false, deletedAt: null } }),
      this.prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.subscription.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.CANCELED } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.EXPIRED } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE, plan: { slug: 'free' } },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE, plan: { slug: 'premium' } },
      }),
      this.prisma.aIProvider.count(),
      this.prisma.aIProvider.count({ where: { isActive: true } }),
      this.prisma.aIProvider.findFirst({
        where: { isDefault: true },
        select: { slug: true },
      }),
      this.prisma.conversation.count({ where: { deletedAt: null } }),
      this.prisma.message.count(),
      this.prisma.webSearch.count(),
      this.prisma.aPIUsageLog.count(),
      this.prisma.aPIUsageLog.count({ where: { statusCode: { gte: 200, lt: 400 } } }),
      this.prisma.aPIUsageLog.count({ where: { statusCode: { gte: 400 } } }),
      this.prisma.aPIUsageLog.aggregate({ _sum: { totalTokens: true } }),
      this.prisma.aPIUsageLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.isHealthy(),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        verified: verifiedUsers,
        unverified: unverifiedUsers,
        recentlyRegistered,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        free: freeActive,
        premium: premiumActive,
        canceled: canceledSubscriptions,
        expired: expiredSubscriptions,
        pastDue: pastDueSubscriptions,
        trialing: trialingSubscriptions,
      },
      providers: {
        total: totalProviders,
        active: activeProviders,
        inactive: totalProviders - activeProviders,
        defaultProvider: defaultProvider?.slug ?? null,
      },
      usage: {
        totalRequests: totalApiRequests,
        successfulRequests: successfulApiRequests,
        failedRequests: failedApiRequests,
        totalTokensUsed: tokenAggregate._sum.totalTokens ?? 0,
        last30DaysRequests,
      },
      chat: {
        totalConversations,
        totalMessages,
      },
      webSearch: {
        totalSearches: totalWebSearches,
      },
      system: {
        database: databaseUp ? 'up' : 'down',
        uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async listUsers(query: AdminUserQueryDto): Promise<PaginatedAdminUsersDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? AdminUserSortField.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortDirection.DESC;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isEmailVerified !== undefined ? { isEmailVerified: query.isEmailVerified } : {}),
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lt: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((user) => this.usersService.toSafeUser(user)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const active = user.subscriptions[0];
    const safe = this.usersService.toSafeUser(user);

    return {
      ...safe,
      deletedAt: user.deletedAt,
      activeSubscription: active
        ? {
            id: active.id,
            status: active.status,
            planName: active.plan.name,
            planSlug: active.plan.slug,
            requestLimit: active.plan.requestLimit,
            currentPeriodStart: active.currentPeriodStart,
            currentPeriodEnd: active.currentPeriodEnd,
          }
        : null,
    };
  }

  async updateUserStatus(userId: string, isActive: boolean): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!isActive && user.role?.name === RoleType.ADMIN && (await this.countActiveAdmins()) <= 1) {
      throw new ConflictException('Cannot deactivate the last active administrator');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: userId },
        data: { isActive },
        include: { role: true },
      });

      if (!isActive) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return next;
    });

    return this.usersService.toSafeUser(updated);
  }

  async updateUserRole(
    actorUserId: string,
    targetUserId: string,
    roleName: RoleType,
  ): Promise<UserResponseDto> {
    const target = await this.usersService.findById(targetUserId);
    if (!target || target.deletedAt !== null) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new BadRequestException(`Role ${roleName} is not configured`);
    }

    if (target.role?.name === roleName) {
      return this.usersService.toSafeUser(target);
    }

    if (
      target.role?.name === RoleType.ADMIN &&
      roleName === RoleType.USER &&
      (await this.countActiveAdmins()) <= 1
    ) {
      throw new ConflictException('Cannot demote the last active administrator');
    }

    if (actorUserId === targetUserId && roleName === RoleType.USER) {
      throw new ConflictException('Administrators cannot demote their own account');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { roleId: role.id },
      include: { role: true },
    });

    return this.usersService.toSafeUser(updated);
  }

  async getUserSubscription(userId: string) {
    await this.ensureUserExists(userId);

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found for this user');
    }

    return {
      id: subscription.id,
      status: subscription.status,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        requestLimit: subscription.plan.requestLimit,
        price: Number(subscription.plan.price),
        currency: subscription.plan.currency,
        billingCycle: subscription.plan.billingCycle,
      },
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledAt: subscription.canceledAt,
      endDate: subscription.endDate,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  async getUserUsageSummary(userId: string): Promise<AdminUserUsageSummaryDto> {
    await this.ensureUserExists(userId);

    const [aggregates, successful, failed, activeSub] = await Promise.all([
      this.prisma.aPIUsageLog.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: {
          totalTokens: true,
          promptTokens: true,
          completionTokens: true,
        },
        _avg: { responseTimeMs: true },
      }),
      this.prisma.aPIUsageLog.count({
        where: { userId, statusCode: { gte: 200, lt: 400 } },
      }),
      this.prisma.aPIUsageLog.count({
        where: { userId, statusCode: { gte: 400 } },
      }),
      this.prisma.subscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let currentPeriodRequests: number | null = null;
    let remainingRequests: number | null = null;

    if (activeSub) {
      currentPeriodRequests = await this.prisma.aPIUsageLog.count({
        where: {
          userId,
          statusCode: { gte: 200, lt: 400 },
          createdAt: {
            gte: activeSub.currentPeriodStart,
            lt: activeSub.currentPeriodEnd,
          },
        },
      });
      remainingRequests =
        activeSub.plan.requestLimit == null
          ? null
          : Math.max(0, activeSub.plan.requestLimit - currentPeriodRequests);
    }

    return {
      userId,
      totalRequests: aggregates._count._all,
      successfulRequests: successful,
      failedRequests: failed,
      totalTokens: aggregates._sum.totalTokens ?? null,
      promptTokens: aggregates._sum.promptTokens ?? null,
      completionTokens: aggregates._sum.completionTokens ?? null,
      averageResponseTimeMs:
        aggregates._avg.responseTimeMs != null
          ? Math.round(aggregates._avg.responseTimeMs * 100) / 100
          : null,
      currentPeriodStart: activeSub?.currentPeriodStart.toISOString() ?? null,
      currentPeriodEnd: activeSub?.currentPeriodEnd.toISOString() ?? null,
      currentPeriodRequests,
      remainingRequests,
    };
  }

  async getUsageAnalytics(filters: {
    from?: string;
    to?: string;
    userId?: string;
    provider?: string;
    endpoint?: string;
    method?: HttpMethod;
    statusCode?: number;
    model?: string;
  }): Promise<AdminUsageAnalyticsDto> {
    const where = this.buildUsageWhere(filters);

    const [
      totalRequests,
      successfulRequests,
      failedRequests,
      aggregates,
      byProvider,
      byEndpoint,
      byStatusCode,
    ] = await Promise.all([
      this.prisma.aPIUsageLog.count({ where }),
      this.prisma.aPIUsageLog.count({
        where: { ...where, statusCode: { gte: 200, lt: 400 } },
      }),
      this.prisma.aPIUsageLog.count({
        where: { ...where, statusCode: { gte: 400 } },
      }),
      this.prisma.aPIUsageLog.aggregate({
        where,
        _avg: { responseTimeMs: true },
        _sum: {
          totalTokens: true,
          promptTokens: true,
          completionTokens: true,
        },
      }),
      this.prisma.aPIUsageLog.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true },
        orderBy: { _count: { provider: 'desc' } },
        take: 20,
      }),
      this.prisma.aPIUsageLog.groupBy({
        by: ['endpoint'],
        where,
        _count: { _all: true },
        orderBy: { _count: { endpoint: 'desc' } },
        take: 20,
      }),
      this.prisma.aPIUsageLog.groupBy({
        by: ['statusCode'],
        where,
        _count: { _all: true },
        orderBy: { _count: { statusCode: 'desc' } },
        take: 20,
      }),
    ]);

    const byDay = await this.getUsageByDay(where);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTimeMs:
        aggregates._avg.responseTimeMs != null
          ? Math.round(aggregates._avg.responseTimeMs * 100) / 100
          : null,
      totalTokens: aggregates._sum.totalTokens ?? null,
      promptTokens: aggregates._sum.promptTokens ?? null,
      completionTokens: aggregates._sum.completionTokens ?? null,
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        requestCount: row._count._all,
        totalTokens: row._sum.totalTokens,
      })),
      byEndpoint: byEndpoint.map((row) => ({
        endpoint: row.endpoint,
        requestCount: row._count._all,
      })),
      byStatusCode: byStatusCode.map((row) => ({
        statusCode: row.statusCode,
        requestCount: row._count._all,
      })),
      byDay,
      periodStart: filters.from ?? null,
      periodEnd: filters.to ?? null,
    };
  }

  async getUsageLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    provider?: string;
    endpoint?: string;
    method?: HttpMethod;
    model?: string;
    statusCode?: number;
    requestId?: string;
    from?: string;
    to?: string;
  }): Promise<PaginatedAdminUsageLogsDto> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildUsageWhere(params);

    const [rows, total] = await Promise.all([
      this.prisma.aPIUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          requestId: true,
          endpoint: true,
          method: true,
          provider: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          statusCode: true,
          responseTimeMs: true,
          ipAddress: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      this.prisma.aPIUsageLog.count({ where }),
    ]);

    const items: AdminUsageLogItemDto[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      requestId: row.requestId,
      endpoint: row.endpoint,
      method: row.method,
      provider: row.provider,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      statusCode: row.statusCode,
      responseTimeMs: row.responseTimeMs,
      ipAddress: row.ipAddress,
      errorMessage: this.sanitizeErrorMessage(row.errorMessage),
      createdAt: row.createdAt,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getSystemHealth(): Promise<AdminSystemHealthDto> {
    const databaseUp = await this.prisma.isHealthy();
    const [total, active, withKey, defaultProvider] = await Promise.all([
      this.prisma.aIProvider.count(),
      this.prisma.aIProvider.count({ where: { isActive: true } }),
      this.prisma.aIProvider.count({ where: { encryptedApiKey: { not: null } } }),
      this.prisma.aIProvider.findFirst({
        where: { isDefault: true },
        select: { slug: true },
      }),
    ]);

    return {
      status: databaseUp ? 'ok' : 'degraded',
      service: 'echogpt-backend',
      version: process.env.npm_package_version ?? '0.1.0',
      database: {
        status: databaseUp ? 'connected' : 'disconnected',
      },
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      providers: {
        total,
        active,
        withConfiguredKey: withKey,
        defaultProvider: defaultProvider?.slug ?? null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  private async countActiveAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: {
        deletedAt: null,
        isActive: true,
        role: { name: RoleType.ADMIN },
      },
    });
  }

  private buildUsageWhere(filters: {
    from?: string;
    to?: string;
    userId?: string;
    provider?: string;
    endpoint?: string;
    method?: HttpMethod;
    statusCode?: number;
    model?: string;
    requestId?: string;
  }): Prisma.APIUsageLogWhereInput {
    const createdAt = this.buildDateFilter(filters.from, filters.to);
    return {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.provider ? { provider: filters.provider } : {}),
      ...(filters.endpoint ? { endpoint: filters.endpoint } : {}),
      ...(filters.method ? { method: filters.method } : {}),
      ...(filters.statusCode != null ? { statusCode: filters.statusCode } : {}),
      ...(filters.model ? { model: filters.model } : {}),
      ...(filters.requestId ? { requestId: filters.requestId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lt: new Date(to) } : {}),
    };
  }

  private sanitizeErrorMessage(message: string | null): string | null {
    if (!message) {
      return null;
    }
    return message
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, '[redacted]')
      .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'api_key=[redacted]');
  }

  private async getUsageByDay(
    where: Prisma.APIUsageLogWhereInput,
  ): Promise<Array<{ date: string; requestCount: number }>> {
    const from =
      where.createdAt && typeof where.createdAt === 'object' && 'gte' in where.createdAt
        ? (where.createdAt.gte as Date | undefined)
        : undefined;
    const to =
      where.createdAt && typeof where.createdAt === 'object' && 'lt' in where.createdAt
        ? (where.createdAt.lt as Date | undefined)
        : undefined;

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; request_count: bigint }>>`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::bigint AS request_count
      FROM api_usage_logs
      WHERE (${from}::timestamptz IS NULL OR created_at >= ${from})
        AND (${to}::timestamptz IS NULL OR created_at < ${to})
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      requestCount: Number(row.request_count),
    }));
  }
}
