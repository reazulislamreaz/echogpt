import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod, SubscriptionStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType } from '../src/roles/enums/role.enum';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';

describe('Subscription & Usage Management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let subscriptionsService: SubscriptionsService;

  const testEmail = `sub_user_${Date.now()}@example.com`;
  const adminEmail = `sub_admin_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  let userToken: string;
  let adminToken: string;
  let userId: string;
  let subId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
    prisma = app.get(PrismaService);
    subscriptionsService = app.get(SubscriptionsService);

    // 1. Register regular user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password,
        firstName: 'Sub',
        lastName: 'User',
      })
      .expect(201);

    userId = regRes.body.user.id;

    // Login regular user
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password,
      })
      .expect(200);

    userToken = loginRes.body.accessToken;

    // 2. Create and login Admin user
    const adminRole = await prisma.role.findUnique({
      where: { name: RoleType.ADMIN },
    });

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        isActive: true,
        isEmailVerified: true,
        roleId: adminRole!.id,
      },
    });

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: adminEmail,
        password,
      })
      .expect(200);

    adminToken = adminLoginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup created test records
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'sub_',
        },
      },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.aPIUsageLog.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    // Clean test plans created
    await prisma.subscriptionPlan.deleteMany({
      where: {
        slug: {
          contains: 'test-custom',
        },
      },
    });

    await app.close();
  });

  describe('1. GET /api/v1/subscriptions/plans', () => {
    it('should list all active subscription plans', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/subscriptions/plans').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const freePlan = res.body.find((p: any) => p.slug === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan.requestLimit).toBe(50);

      const premiumPlan = res.body.find((p: any) => p.slug === 'premium');
      expect(premiumPlan).toBeDefined();
      expect(premiumPlan.requestLimit).toBe(2000);
    });
  });

  describe('2. GET /api/v1/subscriptions/me', () => {
    it('should return authenticated user default FREE subscription', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.status).toBe(SubscriptionStatus.ACTIVE);
      expect(res.body.plan.slug).toBe('free');
      expect(res.body.currentPeriodStart).toBeDefined();
      expect(res.body.currentPeriodEnd).toBeDefined();

      subId = res.body.id;
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/api/v1/subscriptions/me').expect(401);
    });
  });

  describe('3. GET /api/v1/subscriptions/status (Dynamic Usage & Allowance)', () => {
    it('should calculate initial usage and remaining requests dynamically', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.plan.slug).toBe('free');
      expect(res.body.usage).toBe(0);
      expect(res.body.remainingRequests).toBe(50);
      expect(res.body.isUnlimited).toBe(false);
    });

    it('should update dynamic usage count when metered APIUsageLogs are recorded', async () => {
      // 1. Create a metered log within current billing cycle
      await prisma.aPIUsageLog.create({
        data: {
          userId,
          endpoint: '/api/v1/chat/completions',
          method: HttpMethod.POST,
          statusCode: 200,
          responseTimeMs: 250,
        },
      });

      // 2. Create a system log (userId is null) -> should NOT count
      await prisma.aPIUsageLog.create({
        data: {
          userId: null,
          endpoint: '/api/v1/health',
          method: HttpMethod.GET,
          statusCode: 200,
          responseTimeMs: 5,
        },
      });

      // 3. Create a log outside billing cycle -> should NOT count
      await prisma.aPIUsageLog.create({
        data: {
          userId,
          endpoint: '/api/v1/chat/completions',
          method: HttpMethod.POST,
          statusCode: 200,
          responseTimeMs: 200,
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.usage).toBe(1);
      expect(res.body.remainingRequests).toBe(49);
      expect(res.body.usagePercentage).toBe(2);
    });
  });

  describe('4. POST /api/v1/subscriptions/upgrade', () => {
    it('should upgrade user from FREE to PREMIUM in transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/subscriptions/upgrade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planSlug: 'premium' })
        .expect(200);

      expect(res.body.plan.slug).toBe('premium');
      expect(res.body.status).toBe(SubscriptionStatus.ACTIVE);
      expect(res.body.id).not.toBe(subId); // New active subscription

      // Verify status reflects premium limit
      const statusRes = await request(app.getHttpServer())
        .get('/api/v1/subscriptions/status')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(statusRes.body.plan.slug).toBe('premium');
      expect(statusRes.body.remainingRequests).toBe(2000);
    });

    it('should reject upgrade if user is already on the target plan with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions/upgrade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planSlug: 'premium' })
        .expect(409);
    });

    it('should reject non-existent plan with 404 Not Found', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions/upgrade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planSlug: 'unknown-plan' })
        .expect(404);
    });
  });

  describe('5. POST /api/v1/subscriptions/downgrade', () => {
    it('should schedule end-of-period cancellation on downgrade to free', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/subscriptions/downgrade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planSlug: 'free' })
        .expect(200);

      expect(res.body.canceledAt).not.toBeNull();
      expect(res.body.endDate).toBeDefined();
    });

    it('should reject duplicate downgrade request when already scheduled with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions/downgrade')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ planSlug: 'free' })
        .expect(409);
    });
  });

  describe('6. Usage Allowance Enforcement (HTTP 429)', () => {
    it('should reject request allowance and throw HTTP 429 when quota is exceeded', async () => {
      // Temporarily set plan limit to 1 and log 1 request
      const activeSub = await subscriptionsService.getCurrentSubscription(userId);

      // Create dummy logs to exceed remaining quota
      for (let i = 0; i < 2; i++) {
        await prisma.aPIUsageLog.create({
          data: {
            userId,
            endpoint: '/api/v1/chat/completions',
            method: HttpMethod.POST,
            statusCode: 200,
            responseTimeMs: 100,
            createdAt: activeSub.currentPeriodStart,
          },
        });
      }

      // Allowance check should succeed while under 2000
      const allowed = await subscriptionsService.checkRequestAllowance(userId);
      expect(allowed.allowed).toBe(true);

      // Artificially test quota limit by checking a simulated low limit plan
      const testPlan = await prisma.subscriptionPlan.create({
        data: {
          name: 'TEST_QUOTA_PLAN',
          slug: 'test-custom-quota',
          requestLimit: 1,
          price: 0,
        },
      });

      // Update user subscription to low limit plan
      await prisma.subscription.update({
        where: { id: activeSub.id },
        data: { planId: testPlan.id },
      });

      await expect(subscriptionsService.checkRequestAllowance(userId)).rejects.toThrow();

      // Reset subscription back to premium
      const premiumPlan = await prisma.subscriptionPlan.findUnique({
        where: { slug: 'premium' },
      });
      await prisma.subscription.update({
        where: { id: activeSub.id },
        data: { planId: premiumPlan!.id },
      });
    });
  });

  describe('7. Admin Subscriptions Management (RBAC & Plans)', () => {
    it('should block regular USER from accessing admin subscription routes with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/subscription-plans')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/admin/subscriptions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should allow ADMIN to list all subscription plans with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/subscription-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should allow ADMIN to create a new subscription plan', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/subscription-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Custom Team',
          slug: 'test-custom-team',
          description: 'Team plan with custom request volume',
          price: 99.99,
          requestLimit: 10000,
        })
        .expect(201);

      expect(res.body.name).toBe('Custom Team');
      expect(res.body.slug).toBe('test-custom-team');
      expect(res.body.requestLimit).toBe(10000);
    });

    it('should allow ADMIN to list user subscriptions with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/subscriptions?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });
  });
});
