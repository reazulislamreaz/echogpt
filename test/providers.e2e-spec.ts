import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType } from '../src/roles/enums/role.enum';

describe('AI Provider Management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const userEmail = `provider_user_${Date.now()}@example.com`;
  const adminEmail = `provider_admin_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  let userToken: string;
  let adminToken: string;
  let createdProviderId: string;
  let seededOpenAiId: string;

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

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: userEmail,
        password,
        firstName: 'Provider',
        lastName: 'User',
      })
      .expect(201);

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    userToken = userLogin.body.accessToken;

    const adminRole = await prisma.role.findUnique({ where: { name: RoleType.ADMIN } });
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Provider',
        lastName: 'Admin',
        isActive: true,
        isEmailVerified: true,
        roleId: adminRole!.id,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const openai = await prisma.aIProvider.findUnique({ where: { slug: 'OPENAI' } });
    seededOpenAiId = openai!.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'provider_' } },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.userAIProvider.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    if (createdProviderId) {
      await prisma.aIProvider.deleteMany({ where: { id: createdProviderId } });
    }

    await prisma.aIProvider.deleteMany({
      where: { slug: { startsWith: 'TEST_' } },
    });

    await app.close();
  });

  describe('Authorization', () => {
    it('should reject unauthenticated admin provider access with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/ai-providers').expect(401);
    });

    it('should reject USER access to admin providers with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/ai-providers')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Admin provider CRUD', () => {
    it('should list seeded providers for ADMIN without exposing secrets', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/ai-providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body[0].encryptedApiKey).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('encryptedApiKey');
    });

    it('should create a provider with encrypted API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/ai-providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Provider',
          slug: 'test_custom_provider',
          description: 'E2E test provider',
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-e2e-test-secret-key-value',
          isActive: true,
          isDefault: false,
        })
        .expect(201);

      createdProviderId = res.body.id;
      expect(res.body.slug).toBe('TEST_CUSTOM_PROVIDER');
      expect(res.body.keyConfigured).toBe(true);
      expect(res.body.keyPreview).toBe('****alue');
      expect(res.body.apiKey).toBeUndefined();
      expect(res.body.encryptedApiKey).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('sk-e2e-test-secret-key-value');

      const stored = await prisma.aIProvider.findUnique({ where: { id: createdProviderId } });
      expect(stored!.encryptedApiKey).toBeTruthy();
      expect(stored!.encryptedApiKey).not.toBe('sk-e2e-test-secret-key-value');
    });

    it('should reject duplicate provider slug with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/ai-providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate',
          slug: 'TEST_CUSTOM_PROVIDER',
        })
        .expect(409);
    });

    it('should update provider metadata', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/ai-providers/${createdProviderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(res.body.description).toBe('Updated description');
    });

    it('should set provider as default transactionally', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/ai-providers/${createdProviderId}/default`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.isDefault).toBe(true);

      const defaults = await prisma.aIProvider.count({ where: { isDefault: true } });
      expect(defaults).toBe(1);
    });

    it('should reject deleting the default provider with 400', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/ai-providers/${createdProviderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should restore OPENAI as default then allow delete of test provider', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/ai-providers/${seededOpenAiId}/default`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/ai-providers/${createdProviderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      createdProviderId = '';
    });

    it('should return a safe health-check response for seeded OpenAI', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/ai-providers/${seededOpenAiId}/health-check`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.providerId).toBe(seededOpenAiId);
      expect(res.body.slug).toBe('OPENAI');
      expect(typeof res.body.healthy).toBe('boolean');
      expect(res.body.status).toBeDefined();
      expect(JSON.stringify(res.body)).not.toMatch(/sk-/);
    });
  });

  describe('User provider configuration', () => {
    it('should list active providers for authenticated users without system keys', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/providers')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: { slug: string }) => p.slug === 'OPENAI')).toBe(true);
      expect(res.body.every((p: { keyConfigured: boolean }) => p.keyConfigured === false)).toBe(
        true,
      );
    });

    it('should upsert and list user provider configuration securely', async () => {
      const upsert = await request(app.getHttpServer())
        .put(`/api/v1/providers/me/${seededOpenAiId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          apiKey: 'sk-user-provider-secret-key',
          isEnabled: true,
          isDefault: true,
        })
        .expect(200);

      expect(upsert.body.providerId).toBe(seededOpenAiId);
      expect(upsert.body.keyConfigured).toBe(true);
      expect(upsert.body.keyPreview).toBe('****-key');
      expect(JSON.stringify(upsert.body)).not.toContain('sk-user-provider-secret-key');

      const list = await request(app.getHttpServer())
        .get('/api/v1/providers/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(list.body).toHaveLength(1);
      expect(list.body[0].isDefault).toBe(true);
    });

    it('should delete user provider configuration', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/providers/me/${seededOpenAiId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/api/v1/providers/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(list.body).toHaveLength(0);
    });
  });
});
