import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RoleType } from '../roles/enums/role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { EmailService } from './services/email.service';
import { hashToken } from './utils/token.util';

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: any;
  let usersService: any;
  let emailService: { sendVerificationEmail: jest.Mock };

  const mockUserRole = {
    id: 'role-user-id',
    name: RoleType.USER,
    description: 'Standard User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    isActive: true,
    isEmailVerified: false,
    roleId: mockUserRole.id,
    role: mockUserRole,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('StrongPassword123!', 10);
  });

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailVerificationToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'free-plan-id',
          name: 'FREE',
          slug: 'free',
          billingCycle: 'monthly',
        }),
      },
      subscription: {
        create: jest.fn().mockResolvedValue({ id: 'sub-id' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return callback;
      }),
    };

    const mockUsers = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findRoleByName: jest.fn().mockResolvedValue(mockUserRole),
      create: jest.fn(),
      update: jest.fn(),
      validateAccountStatus: jest.fn().mockImplementation((u) => {
        if (u.deletedAt !== null) {
          throw new UnauthorizedException('User account has been deleted');
        }
        if (!u.isActive) {
          throw new UnauthorizedException('User account is deactivated');
        }
      }),
      toSafeUser: jest.fn().mockImplementation((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
        isEmailVerified: u.isEmailVerified,
        role: u.role?.name ?? 'USER',
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    };

    const mockJwt = {
      sign: jest.fn().mockReturnValue('mock-jwt-access-token'),
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        const configMap: Record<string, unknown> = {
          'app.jwt.accessSecret': 'test-access-secret',
          'app.jwt.accessExpiresIn': '15m',
          'app.jwt.refreshExpiresIn': '7d',
          'app.auth.bcryptSaltRounds': 10,
          'app.auth.verificationExpiresHours': 24,
        };
        return configMap[key] ?? defaultValue;
      }),
    };

    const mockEmail = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsers },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    usersService = module.get(UsersService);
    emailService = module.get(EmailService);
  });

  describe('Registration', () => {
    it('should successfully register a new user with USER role and hashed verification token', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);
      prismaService.emailVerificationToken.create.mockResolvedValue({
        id: 'token-id',
        userId: mockUser.id,
        tokenHash: 'hashed',
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await authService.register({
        email: 'TEST@example.com',
        password: 'StrongPassword123!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(RoleType.USER);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            isActive: true,
            isEmailVerified: false,
            roleId: mockUserRole.id,
          }),
        }),
      );
      expect(result.message).toContain('Please check your email');
    });

    it('should still register when verification email dispatch fails', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockResolvedValue(mockUser);
      prismaService.emailVerificationToken.create.mockResolvedValue({
        id: 'token-id',
        userId: mockUser.id,
        tokenHash: 'hashed',
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      });
      emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));

      const result = await authService.register({
        email: 'smtp-fail@example.com',
        password: 'StrongPassword123!',
        firstName: 'Test',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.message).toContain('resend-verification');
      expect(result.message).not.toContain('Please check your email');
    });

    it('should reject registration if email is already registered', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Login', () => {
    it('should authenticate user and return access token, refresh token, and safe user', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.session.create.mockResolvedValue({
        id: 'session-id',
        userId: mockUser.id,
        refreshTokenHash: 'hash',
        userAgent: 'Jest',
        ipAddress: '127.0.0.1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.login(
        { email: 'test@example.com', password: 'StrongPassword123!' },
        '127.0.0.1',
        'Jest',
      );

      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(mockUser.email);
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(prismaService.session.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is deleted', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Refresh Token Rotation & Replay Protection', () => {
    const rawRefreshToken = 'valid-refresh-token-12345';
    const hashed = hashToken(rawRefreshToken);

    it('should issue new access token, rotate refresh token, and revoke old session', async () => {
      const activeSession = {
        id: 'session-1',
        userId: mockUser.id,
        refreshTokenHash: hashed,
        userAgent: 'Jest',
        ipAddress: '127.0.0.1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockUser,
      };

      prismaService.session.findUnique.mockResolvedValue(activeSession);
      prismaService.session.update.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date(),
      });
      prismaService.session.create.mockResolvedValue({
        id: 'session-2',
        userId: mockUser.id,
        refreshTokenHash: 'new-hash',
        userAgent: 'Jest',
        ipAddress: '127.0.0.1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.refresh(rawRefreshToken);

      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawRefreshToken);
      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: activeSession.id },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(prismaService.session.create).toHaveBeenCalled();
    });

    it('should reject already revoked session (replay attack protection)', async () => {
      const revokedSession = {
        id: 'session-revoked',
        userId: mockUser.id,
        refreshTokenHash: hashed,
        userAgent: 'Jest',
        ipAddress: '127.0.0.1',
        revokedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockUser,
      };

      prismaService.session.findUnique.mockResolvedValue(revokedSession);

      await expect(authService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired refresh token session', async () => {
      const expiredSession = {
        id: 'session-expired',
        userId: mockUser.id,
        refreshTokenHash: hashed,
        userAgent: 'Jest',
        ipAddress: '127.0.0.1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockUser,
      };

      prismaService.session.findUnique.mockResolvedValue(expiredSession);

      await expect(authService.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Logout', () => {
    it('should revoke matching session or active user sessions', async () => {
      prismaService.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await authService.logout('user-uuid-1', 'raw-token');

      expect(result.message).toBe('Logged out successfully');
      expect(prismaService.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-uuid-1',
            revokedAt: null,
          }),
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Email Verification', () => {
    const rawVerificationToken = 'verification-token-xyz';
    const hashed = hashToken(rawVerificationToken);

    it('should verify email and set isEmailVerified to true', async () => {
      prismaService.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'token-uuid',
        userId: mockUser.id,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        createdAt: new Date(),
        user: mockUser,
      });

      const result = await authService.verifyEmail(rawVerificationToken);

      expect(result.message).toBe('Email verified successfully');
      expect(prismaService.emailVerificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-uuid' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(prismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: { isEmailVerified: true },
        }),
      );
    });

    it('should reject already used verification token', async () => {
      prismaService.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'token-uuid',
        userId: mockUser.id,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
        user: mockUser,
      });

      await expect(authService.verifyEmail(rawVerificationToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject expired verification token', async () => {
      prismaService.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'token-uuid',
        userId: mockUser.id,
        tokenHash: hashed,
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        createdAt: new Date(),
        user: mockUser,
      });

      await expect(authService.verifyEmail(rawVerificationToken)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Current User (getMe)', () => {
    it('should return safe user representation for active user', async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await authService.getCurrentUser(mockUser.id);

      expect(result.email).toBe(mockUser.email);
      expect(result.role).toBe(RoleType.USER);
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException if user not found or deleted', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(authService.getCurrentUser('missing-id')).rejects.toThrow(UnauthorizedException);
    });
  });
});
