import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: any;
  let usageService: any;

  const mockFreePlan = {
    id: 'free-plan-id',
    name: 'FREE',
    slug: 'free',
    description: 'Free tier',
    price: new Prisma.Decimal(0),
    currency: 'USD',
    billingCycle: 'monthly',
    requestLimit: 50,
    features: { webSearchEnabled: true },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPremiumPlan = {
    id: 'premium-plan-id',
    name: 'PREMIUM',
    slug: 'premium',
    description: 'Premium tier',
    price: new Prisma.Decimal(20),
    currency: 'USD',
    billingCycle: 'monthly',
    requestLimit: 2000,
    features: { prioritySupport: true },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockActiveSubscription = {
    id: 'sub-active-id',
    userId: 'user-1',
    planId: mockFreePlan.id,
    plan: mockFreePlan,
    status: SubscriptionStatus.ACTIVE,
    startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    endDate: null,
    currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      subscriptionPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return callback;
      }),
    };

    const mockUsage = {
      getUsageCount: jest.fn().mockResolvedValue(10),
      recordUsage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsageService, useValue: mockUsage },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    prisma = module.get(PrismaService);
    usageService = module.get(UsageService);
  });

  describe('Plans', () => {
    it('getActivePlans should return active plans in safe format', async () => {
      prisma.subscriptionPlan.findMany.mockResolvedValue([mockFreePlan, mockPremiumPlan]);

      const plans = await service.getActivePlans();
      expect(plans.length).toBe(2);
      expect(plans[0].slug).toBe('free');
      expect(plans[0].price).toBe('0');
      expect(plans[1].slug).toBe('premium');
    });

    it('adminCreatePlan should create a plan and reject duplicates', async () => {
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.create.mockResolvedValue({
        ...mockFreePlan,
        name: 'ENTERPRISE',
        slug: 'enterprise',
      });

      const res = await service.adminCreatePlan({
        name: 'ENTERPRISE',
        slug: 'enterprise',
        price: 99,
        requestLimit: 10000,
      });

      expect(res.name).toBe('ENTERPRISE');
      expect(prisma.subscriptionPlan.create).toHaveBeenCalled();
    });

    it('adminCreatePlan should throw ConflictException if plan exists', async () => {
      prisma.subscriptionPlan.findFirst.mockResolvedValue(mockFreePlan);

      await expect(
        service.adminCreatePlan({
          name: 'FREE',
          slug: 'free',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Current Subscription Resolution & Auto-Provisioning', () => {
    it('should return existing active subscription', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      const sub = await service.getCurrentSubscription('user-1');
      expect(sub.id).toBe(mockActiveSubscription.id);
      expect(sub.plan.slug).toBe('free');
    });

    it('should auto-provision FREE subscription if user has no subscription record', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockFreePlan);
      prisma.subscription.create.mockResolvedValue(mockActiveSubscription);

      const sub = await service.getCurrentSubscription('user-new');
      expect(sub).toBeDefined();
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-new',
            planId: mockFreePlan.id,
            status: SubscriptionStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should rollover expired active subscription to next billing period', async () => {
      const expiredActiveSub = {
        ...mockActiveSubscription,
        currentPeriodStart: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      };

      prisma.subscription.findFirst.mockResolvedValue(expiredActiveSub);
      prisma.subscription.update.mockResolvedValue({
        ...expiredActiveSub,
        currentPeriodStart: expiredActiveSub.currentPeriodEnd,
        currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      });

      const sub = await service.getCurrentSubscription('user-1');
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: expiredActiveSub.id },
          data: expect.objectContaining({
            currentPeriodStart: expiredActiveSub.currentPeriodEnd,
          }),
        }),
      );
      expect(sub).toBeDefined();
    });
  });

  describe('Subscription Status & Dynamic Usage Calculation', () => {
    it('should calculate dynamic usage and remaining requests', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      usageService.getUsageCount.mockResolvedValue(20);

      const status = await service.getSubscriptionStatus('user-1');
      expect(status.status).toBe(SubscriptionStatus.ACTIVE);
      expect(status.usage).toBe(20);
      expect(status.remainingRequests).toBe(30); // 50 - 20
      expect(status.isUnlimited).toBe(false);
      expect(status.usagePercentage).toBe(40);
    });

    it('should handle unlimited plans without negative remaining requests', async () => {
      const unlimitedSub = {
        ...mockActiveSubscription,
        plan: {
          ...mockFreePlan,
          requestLimit: null,
        },
      };
      prisma.subscription.findFirst.mockResolvedValue(unlimitedSub);
      usageService.getUsageCount.mockResolvedValue(500);

      const status = await service.getSubscriptionStatus('user-1');
      expect(status.usage).toBe(500);
      expect(status.isUnlimited).toBe(true);
      expect(status.remainingRequests).toBeNull();
      expect(status.usagePercentage).toBe(0);
    });
  });

  describe('checkRequestAllowance (Enforcement)', () => {
    it('should allow request when usage is below limit', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      usageService.getUsageCount.mockResolvedValue(49);

      const res = await service.checkRequestAllowance('user-1');
      expect(res.allowed).toBe(true);
      expect(res.remainingRequests).toBe(1);
    });

    it('should throw HTTP 429 Too Many Requests when usage reaches plan limit', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      usageService.getUsageCount.mockResolvedValue(50); // limit is 50

      await expect(service.checkRequestAllowance('user-1')).rejects.toThrow(HttpException);

      try {
        await service.checkRequestAllowance('user-1');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  describe('Upgrade & Downgrade', () => {
    it('should upgrade user from Free to Premium plan in transaction', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPremiumPlan);

      const newPremiumSub = {
        ...mockActiveSubscription,
        id: 'new-premium-sub',
        planId: mockPremiumPlan.id,
        plan: mockPremiumPlan,
      };

      prisma.subscription.update.mockResolvedValue(mockActiveSubscription);
      prisma.subscription.create.mockResolvedValue(newPremiumSub);

      const res = await service.upgrade('user-1', 'premium');

      expect(res.plan.slug).toBe('premium');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject upgrade if user is already on the target plan', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockFreePlan);

      await expect(service.upgrade('user-1', 'free')).rejects.toThrow(ConflictException);
    });

    it('should reject upgrade to a lower or equal tier with BadRequestException', async () => {
      const activePremiumSub = {
        ...mockActiveSubscription,
        planId: mockPremiumPlan.id,
        plan: mockPremiumPlan,
      };
      prisma.subscription.findFirst.mockResolvedValue(activePremiumSub);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockFreePlan);

      await expect(service.upgrade('user-1', 'free')).rejects.toThrow(BadRequestException);
    });

    it('should clear scheduled downgrade when upgrading back to the same plan', async () => {
      const premiumPendingDowngrade = {
        ...mockActiveSubscription,
        planId: mockPremiumPlan.id,
        plan: mockPremiumPlan,
        canceledAt: new Date(),
        endDate: mockActiveSubscription.currentPeriodEnd,
      };
      prisma.subscription.findFirst.mockResolvedValue(premiumPendingDowngrade);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPremiumPlan);
      prisma.subscription.update.mockResolvedValue({
        ...premiumPendingDowngrade,
        canceledAt: null,
        endDate: null,
      });

      const res = await service.upgrade('user-1', 'premium');
      expect(res.canceledAt).toBeNull();
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: premiumPendingDowngrade.id },
          data: { canceledAt: null, endDate: null },
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should schedule end-of-period cancellation on downgrade', async () => {
      const activePremiumSub = {
        ...mockActiveSubscription,
        planId: mockPremiumPlan.id,
        plan: mockPremiumPlan,
      };

      prisma.subscription.findFirst.mockResolvedValue(activePremiumSub);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockFreePlan);

      const scheduledDowngrade = {
        ...activePremiumSub,
        canceledAt: new Date(),
        endDate: activePremiumSub.currentPeriodEnd,
      };
      prisma.subscription.update.mockResolvedValue(scheduledDowngrade);

      const res = await service.downgrade('user-1', 'free');
      expect(res.canceledAt).toBeDefined();
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            canceledAt: expect.any(Date),
            endDate: activePremiumSub.currentPeriodEnd,
          }),
        }),
      );
    });

    it('should reject downgrade if user is already on target plan', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockFreePlan);

      await expect(service.downgrade('user-1', 'free')).rejects.toThrow(BadRequestException);
    });

    it('should reject downgrade to a higher tier with BadRequestException', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(mockPremiumPlan);

      await expect(service.downgrade('user-1', 'premium')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Admin Subscriptions Management', () => {
    it('adminGetSubscriptions should return paginated list', async () => {
      prisma.subscription.findMany.mockResolvedValue([mockActiveSubscription]);
      prisma.subscription.count.mockResolvedValue(1);

      const res = await service.adminGetSubscriptions(1, 20);
      expect(res.items.length).toBe(1);
      expect(res.meta.total).toBe(1);
    });

    it('adminUpdateSubscriptionStatus should update status', async () => {
      prisma.subscription.findUnique.mockResolvedValue(mockActiveSubscription);
      prisma.subscription.update.mockResolvedValue({
        ...mockActiveSubscription,
        status: SubscriptionStatus.PAST_DUE,
      });

      const res = await service.adminUpdateSubscriptionStatus(
        'sub-active-id',
        SubscriptionStatus.PAST_DUE,
      );
      expect(res.status).toBe(SubscriptionStatus.PAST_DUE);
    });
  });
});
