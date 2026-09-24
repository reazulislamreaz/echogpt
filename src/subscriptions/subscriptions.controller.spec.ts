import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsControllers', () => {
  let userController: SubscriptionsController;
  let adminController: AdminSubscriptionsController;
  let service: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    role: 'USER',
  };

  const mockSafePlan = {
    id: 'plan-1',
    name: 'FREE',
    slug: 'free',
    price: '0.00',
    currency: 'USD',
    billingCycle: 'monthly',
    requestLimit: 50,
    features: null,
    isActive: true,
    createdAt: new Date(),
  };

  const mockSafeSubscription = {
    id: 'sub-1',
    status: 'ACTIVE',
    plan: mockSafePlan,
    startDate: new Date(),
    endDate: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    canceledAt: null,
  };

  const mockStatus = {
    plan: { id: 'plan-1', name: 'FREE', slug: 'free', requestLimit: 50 },
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    usage: 10,
    remainingRequests: 40,
    isUnlimited: false,
    usagePercentage: 20,
    canceledAt: null,
  };

  beforeEach(async () => {
    const mockService = {
      getActivePlans: jest.fn().mockResolvedValue([mockSafePlan]),
      getAllPlans: jest.fn().mockResolvedValue([mockSafePlan]),
      getCurrentSubscription: jest.fn().mockResolvedValue(mockSafeSubscription),
      getSubscriptionStatus: jest.fn().mockResolvedValue(mockStatus),
      toSafeSubscription: jest.fn().mockReturnValue(mockSafeSubscription),
      upgrade: jest.fn().mockResolvedValue(mockSafeSubscription),
      downgrade: jest.fn().mockResolvedValue(mockSafeSubscription),
      adminCreatePlan: jest.fn().mockResolvedValue(mockSafePlan),
      adminUpdatePlan: jest.fn().mockResolvedValue(mockSafePlan),
      adminGetSubscriptions: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      adminUpdateSubscriptionStatus: jest.fn().mockResolvedValue(mockSafeSubscription),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController, AdminSubscriptionsController],
      providers: [{ provide: SubscriptionsService, useValue: mockService }],
    }).compile();

    userController = module.get<SubscriptionsController>(SubscriptionsController);
    adminController = module.get<AdminSubscriptionsController>(AdminSubscriptionsController);
    service = module.get(SubscriptionsService);
  });

  describe('User Controller', () => {
    it('getPlans should return active plans', async () => {
      const res = await userController.getPlans();
      expect(res).toEqual([mockSafePlan]);
      expect(service.getActivePlans).toHaveBeenCalled();
    });

    it('getMySubscription should return user subscription', async () => {
      const res = await userController.getMySubscription(mockUser);
      expect(res).toEqual(mockSafeSubscription);
      expect(service.getCurrentSubscription).toHaveBeenCalledWith(mockUser.id);
    });

    it('getStatus should return dynamic usage quota', async () => {
      const res = await userController.getStatus(mockUser);
      expect(res.remainingRequests).toBe(40);
      expect(service.getSubscriptionStatus).toHaveBeenCalledWith(mockUser.id);
    });

    it('upgrade should delegate to service', async () => {
      const res = await userController.upgrade(mockUser, {
        planSlug: 'premium',
      });
      expect(res).toEqual(mockSafeSubscription);
      expect(service.upgrade).toHaveBeenCalledWith(mockUser.id, 'premium');
    });

    it('downgrade should delegate to service', async () => {
      const res = await userController.downgrade(mockUser, { planSlug: 'free' });
      expect(res).toEqual(mockSafeSubscription);
      expect(service.downgrade).toHaveBeenCalledWith(mockUser.id, 'free');
    });
  });

  describe('Admin Controller', () => {
    it('getPlans should return all plans for admin', async () => {
      const res = await adminController.getPlans();
      expect(res).toEqual([mockSafePlan]);
      expect(service.getAllPlans).toHaveBeenCalled();
    });

    it('createPlan should delegate to service', async () => {
      const dto = { name: 'PRO', slug: 'pro' };
      const res = await adminController.createPlan(dto);
      expect(res).toEqual(mockSafePlan);
      expect(service.adminCreatePlan).toHaveBeenCalledWith(dto);
    });
  });
});
