import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('User Management & Profile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEmail = `profile_user_${Date.now()}@example.com`;
  const initialPassword = 'InitialPassword123!';
  const updatedPassword = 'NewStrongPassword123!';

  let accessToken: string;
  let refreshToken: string;
  let userId: string;

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

    // Register test user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: initialPassword,
        firstName: 'OriginalFirst',
        lastName: 'OriginalLast',
      })
      .expect(201);

    userId = regRes.body.user.id;

    // Login test user
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: initialPassword,
      })
      .expect(200);

    accessToken = loginRes.body.accessToken;
    refreshToken = loginRes.body.refreshToken;
  });

  afterAll(async () => {
    // Clean up created test data
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'profile_user_',
        },
      },
      select: { id: true },
    });

    for (const u of users) {
      await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.subscription.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    await app.close();
  });

  describe('1. GET /api/v1/users/me', () => {
    it('should return the authenticated user safe profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(userId);
      expect(res.body.email).toBe(testEmail.toLowerCase());
      expect(res.body.firstName).toBe('OriginalFirst');
      expect(res.body.lastName).toBe('OriginalLast');
      expect(res.body.role).toBe('USER');
      expect(res.body.isActive).toBe(true);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.deletedAt).toBeUndefined();
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });
  });

  describe('2. PATCH /api/v1/users/me', () => {
    it('should update allowed profile fields (firstName, lastName, avatarUrl)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          avatarUrl: 'https://example.com/avatar.jpg',
        })
        .expect(200);

      expect(res.body.firstName).toBe('UpdatedFirst');
      expect(res.body.lastName).toBe('UpdatedLast');
      expect(res.body.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should reject unallowed security fields (email, roleId, isActive, passwordHash) with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'hacked@example.com',
          roleId: 'f9382018-8472-4729-10ab-38472910ab38',
          isActive: false,
        })
        .expect(400);
    });

    it('should reject invalid avatarUrl format with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          avatarUrl: 'not-a-valid-url',
        })
        .expect(400);
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ firstName: 'Unauthorized' })
        .expect(401);
    });
  });

  describe('3. PATCH /api/v1/users/me/password', () => {
    it('should reject incorrect current password with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongCurrentPassword123!',
          newPassword: updatedPassword,
        })
        .expect(400);
    });

    it('should reject weak new password with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: initialPassword,
          newPassword: 'weak',
        })
        .expect(400);
    });

    it('should reject new password identical to current password with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: initialPassword,
          newPassword: initialPassword,
        })
        .expect(400);
    });

    it('should successfully change password and revoke existing sessions', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: initialPassword,
          newPassword: updatedPassword,
        })
        .expect(200);

      expect(res.body.message).toContain('Password changed successfully');

      // Verify old refresh token is revoked
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      // Verify old password cannot log in
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: initialPassword,
        })
        .expect(401);

      // Verify new password logs in successfully
      const newLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: updatedPassword,
        })
        .expect(200);

      expect(newLogin.body.accessToken).toBeDefined();
      accessToken = newLogin.body.accessToken;
      refreshToken = newLogin.body.refreshToken;
    });
  });

  describe('4. DELETE /api/v1/users/me', () => {
    it('should soft delete user account, deactivate it, and revoke sessions', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.message).toBe('Account successfully deleted');

      // Verify database record still exists (soft-deleted, not dropped)
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
      });
      expect(userRecord).toBeDefined();
      expect(userRecord!.deletedAt).not.toBeNull();
      expect(userRecord!.isActive).toBe(false);

      // Verify subsequent authenticated requests fail with 401
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // Verify login fails for deleted account
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: updatedPassword,
        })
        .expect(401);

      // Verify refresh token fails for deleted account
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });
});
