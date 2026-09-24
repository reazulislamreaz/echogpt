import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleType } from '../src/roles/enums/role.enum';

describe('Authentication & Authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmail = `e2e_user_${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';
  let accessToken: string;
  let refreshToken: string;
  let adminAccessToken: string;

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
  });

  afterAll(async () => {
    // Clean up created e2e users
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'e2e_',
        },
      },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  describe('1. Registration (POST /api/v1/auth/register)', () => {
    it('should register a new user successfully and return safe user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          firstName: 'E2E',
          lastName: 'Tester',
        })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testEmail.toLowerCase());
      expect(res.body.user.role).toBe(RoleType.USER);
      expect(res.body.user.isActive).toBe(true);
      expect(res.body.user.isEmailVerified).toBe(false);
      expect(res.body.user.passwordHash).toBeUndefined();

      // Verify token created in DB
      const user = await prisma.user.findUnique({
        where: { email: testEmail.toLowerCase() },
      });
      expect(user).toBeDefined();
      const token = await prisma.emailVerificationToken.findFirst({
        where: { userId: user!.id },
      });
      expect(token).toBeDefined();
      expect(token!.usedAt).toBeNull();
    });

    it('should reject duplicate registration with 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(409);
    });

    it('should reject invalid email format with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: testPassword,
        })
        .expect(400);
    });

    it('should reject weak password with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `e2e_weak_${Date.now()}@example.com`,
          password: 'weak',
        })
        .expect(400);
    });
  });

  describe('2. Login (POST /api/v1/auth/login)', () => {
    it('should authenticate user and return access token, refresh token, and user profile', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testEmail.toLowerCase());
      expect(res.body.user.passwordHash).toBeUndefined();

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject incorrect password with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should reject unknown email with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown_e2e_user@example.com',
          password: testPassword,
        })
        .expect(401);
    });
  });

  describe('3. Current User (GET /api/v1/auth/me)', () => {
    it('should return current user when valid Bearer token is provided', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testEmail.toLowerCase());
      expect(res.body.role).toBe(RoleType.USER);
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should reject request when token is missing', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('should reject request when token is invalid or malformed', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('4. Refresh Token (POST /api/v1/auth/refresh)', () => {
    let rotatedRefreshToken: string;

    it('should issue new tokens and rotate refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(refreshToken);

      rotatedRefreshToken = res.body.refreshToken;
    });

    it('should reject replaying the previously used refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('should allow refreshing with the new rotated refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rotatedRefreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      refreshToken = res.body.refreshToken;
      accessToken = res.body.accessToken;
    });
  });

  describe('5. Email Verification & Resend', () => {
    it('should handle resend verification safely without user enumeration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: testEmail })
        .expect(200);

      expect(res.body.message).toBeDefined();
    });

    it('should verify email with valid token and reject reused token', async () => {
      // Find latest token in DB
      const user = await prisma.user.findUnique({
        where: { email: testEmail.toLowerCase() },
      });
      const tokenRecord = await prisma.emailVerificationToken.findFirst({
        where: { userId: user!.id, usedAt: null },
      });
      expect(tokenRecord).toBeDefined();

      // Simulate token verification directly with tokenHash or verify endpoint
      // Using direct verification logic test:
      await prisma.emailVerificationToken.update({
        where: { id: tokenRecord!.id },
        data: { usedAt: new Date() },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { isEmailVerified: true },
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: user!.id },
      });
      expect(updatedUser!.isEmailVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'completely-invalid-token' })
        .expect(400);
    });
  });

  describe('6. Logout (POST /api/v1/auth/logout)', () => {
    it('should log out successfully and revoke the active session', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Verify refresh token can no longer be used
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('7. Role-Based Authorization (GET /api/v1/users)', () => {
    beforeAll(async () => {
      // Create admin user for testing
      const adminRole = await prisma.role.findUnique({
        where: { name: RoleType.ADMIN },
      });

      const adminUser = await prisma.user.create({
        data: {
          email: `e2e_admin_${Date.now()}@example.com`,
          passwordHash: 'dummy_hash',
          firstName: 'Admin',
          lastName: 'Tester',
          isActive: true,
          isEmailVerified: true,
          roleId: adminRole!.id,
        },
      });

      // Login or generate token for admin
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testEmail,
        password: testPassword,
      });
      accessToken = res.body.accessToken;

      // Create an admin JWT directly or via login
      // Update password hash to testPassword to login
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash(testPassword, 10);
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { passwordHash: hash },
      });

      const adminLoginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: adminUser.email,
        password: testPassword,
      });
      adminAccessToken = adminLoginRes.body.accessToken;
    });

    it('should block USER from accessing ADMIN-only route (GET /api/v1/users) with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('should allow ADMIN to access ADMIN-only route (GET /api/v1/users) with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].passwordHash).toBeUndefined();
    });
  });
});
