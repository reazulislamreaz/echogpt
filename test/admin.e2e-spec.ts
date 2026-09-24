import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType } from '../src/roles/enums/role.enum';

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'StrongPassword123!';
  const userEmail = `admin_audit_user_${Date.now()}@example.com`;
  const adminEmail = `admin_audit_admin_${Date.now()}@example.com`;

  let userToken: string;
  let adminToken: string;
  let targetUserId: string;

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
      .send({ email: userEmail, password, firstName: 'User' })
      .expect(201);
    targetUserId = userReg.body.user.id;

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    userToken = userLogin.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password, firstName: 'Admin' })
      .expect(201);

    const adminRole = await prisma.role.findUnique({ where: { name: RoleType.ADMIN } });
    await prisma.user.update({
      where: { email: adminEmail },
      data: { roleId: adminRole!.id, isEmailVerified: true },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'admin_audit_' } },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.aPIUsageLog.deleteMany({ where: { userId: u.id } });
      await prisma.webSearch.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  it('rejects non-admin access to dashboard with 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns dashboard statistics for admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.totalUsers).toBeGreaterThanOrEqual(2);
    expect(res.body).toHaveProperty('totalApiRequests');
    expect(JSON.stringify(res.body)).not.toMatch(/password|apiKey|secret/i);
  });

  it('returns usage analytics and logs for admin', async () => {
    await prisma.aPIUsageLog.create({
      data: {
        userId: targetUserId,
        endpoint: '/api/v1/web-search',
        method: HttpMethod.POST,
        provider: 'mock',
        statusCode: 200,
        responseTimeMs: 42,
      },
    });

    const analytics = await request(app.getHttpServer())
      .get('/api/v1/admin/usage/analytics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(analytics.body.totalRequests).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(analytics.body.byProvider)).toBe(true);

    const logs = await request(app.getHttpServer())
      .get('/api/v1/admin/usage/logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(logs.body.items.length).toBeGreaterThanOrEqual(1);
    expect(logs.body.meta).toBeDefined();
  });

  it('returns admin health without secrets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.database).toBe('up');
    expect(res.body.providers).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/sk-|apiKey|ENCRYPTION/i);
  });

  it('allows admin to deactivate a user', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    expect(res.body.isActive).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });
});
