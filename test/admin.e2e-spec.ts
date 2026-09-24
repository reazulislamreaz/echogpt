import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType } from '../src/roles/enums/role.enum';

describe('Admin Management & Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'StrongPassword123!';
  const userEmail = `admin_step12_user_${Date.now()}@example.com`;
  const adminEmail = `admin_step12_admin_${Date.now()}@example.com`;
  const secondAdminEmail = `admin_step12_admin2_${Date.now()}@example.com`;

  let userToken: string;
  let adminToken: string;
  let targetUserId: string;
  let subscriptionId: string;

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

    const userReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password, firstName: 'User', lastName: 'One' })
      .expect(201);
    targetUserId = userReg.body.user.id;

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    userToken = userLogin.body.accessToken;

    const adminRole = await prisma.role.findUnique({ where: { name: RoleType.ADMIN } });

    for (const email of [adminEmail, secondAdminEmail]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password, firstName: 'Admin' })
        .expect(201);
      await prisma.user.update({
        where: { email },
        data: { roleId: adminRole!.id, isEmailVerified: true },
      });
    }

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const sub = await prisma.subscription.findFirst({
      where: { userId: targetUserId, status: 'ACTIVE' },
    });
    subscriptionId = sub!.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'admin_step12_' } },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.aPIUsageLog.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  it('rejects unauthenticated and non-admin access', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/dashboard').expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns nested dashboard statistics for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.users.total).toBeGreaterThanOrEqual(2);
    expect(res.body.subscriptions).toBeDefined();
    expect(res.body.usage).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|apiKey|ENCRYPTION/i);
  });

  it('lists and filters users', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?search=User&role=${RoleType.USER}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body.items.some((u: { id: string }) => u.id === targetUserId)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.email).toBe(userEmail.toLowerCase());
    expect(detail.body.passwordHash).toBeUndefined();
  });

  it('updates role and returns subscription/usage summaries', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: RoleType.USER })
      .expect(200);

    const sub = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${targetUserId}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(sub.body.plan).toBeDefined();

    await prisma.aPIUsageLog.create({
      data: {
        userId: targetUserId,
        endpoint: '/api/v1/web-search',
        method: HttpMethod.POST,
        provider: 'mock',
        statusCode: 200,
        responseTimeMs: 15,
      },
    });

    const usage = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${targetUserId}/usage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(usage.body.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('lists subscriptions with filters and by id', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/subscriptions?userId=${targetUserId}&status=ACTIVE`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);

    const one = await request(app.getHttpServer())
      .get(`/api/v1/admin/subscriptions/${subscriptionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(one.body.id).toBe(subscriptionId);
  });

  it('returns usage analytics, logs, and system health', async () => {
    const analytics = await request(app.getHttpServer())
      .get('/api/v1/admin/usage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(analytics.body.totalRequests).toBeGreaterThanOrEqual(1);
    expect(analytics.body.byStatusCode).toBeDefined();

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logs.body.items.length).toBeGreaterThanOrEqual(1);

    const health = await request(app.getHttpServer())
      .get('/api/v1/admin/system/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(health.body.database.status).toBe('connected');
  });

  it('activates and deactivates a user', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });
});
