import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  let initialPasswordHash: string;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '',
    firstName: 'First',
    lastName: 'Last',
    avatarUrl: null,
    isActive: true,
    isEmailVerified: false,
    roleId: 'role-1',
    role: { id: 'role-1', name: 'USER', description: null },
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    initialPasswordHash = await bcrypt.hash('OldPassword123!', 10);
    mockUser.passwordHash = initialPasswordHash;
  });

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      session: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return callback;
      }),
    };

    const mockConfig = {
      get: jest.fn().mockReturnValue(10),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  describe('findById & findByEmail', () => {
    it('findById should return user with role', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findById('user-1');
      expect(user).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: { role: true },
      });
    });

    it('findByEmail should normalize email before query', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const user = await service.findByEmail('  TEST@Example.Com  ');
      expect(user).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: { role: true },
      });
    });
  });

  describe('validateAccountStatus', () => {
    it('should throw UnauthorizedException on deleted user', () => {
      expect(() =>
        service.validateAccountStatus({
          isActive: true,
          deletedAt: new Date(),
        }),
      ).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on deactivated user', () => {
      expect(() =>
        service.validateAccountStatus({
          isActive: false,
          deletedAt: null,
        }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('toSafeUser', () => {
    it('should omit passwordHash and deletedAt', () => {
      const safe = service.toSafeUser(mockUser);
      expect((safe as any).passwordHash).toBeUndefined();
      expect((safe as any).deletedAt).toBeUndefined();
      expect(safe.email).toBe(mockUser.email);
      expect(safe.role).toBe('USER');
    });
  });

  describe('getCurrentUserProfile', () => {
    it('should return safe user profile for active user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getCurrentUserProfile('user-1');
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.getCurrentUserProfile('user-1')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await expect(service.getCurrentUserProfile('user-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('should update allowed fields and return safe user representation', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = {
        ...mockUser,
        firstName: 'Jane',
        lastName: 'Smith',
        avatarUrl: 'https://example.com/avatar.png',
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-1', {
        firstName: 'Jane',
        lastName: 'Smith',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect((result as any).passwordHash).toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            firstName: 'Jane',
            lastName: 'Smith',
            avatarUrl: 'https://example.com/avatar.png',
          },
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('should change password and revoke active sessions in a transaction', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.changePassword('user-1', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword123!',
      });

      expect(result.message).toContain('Password changed successfully');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            passwordHash: expect.any(String),
          }),
        }),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('should reject incorrect current password with BadRequestException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'IncorrectPassword!',
          newPassword: 'NewStrongPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject identical new password with BadRequestException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'OldPassword123!',
          newPassword: 'OldPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDeleteAccount', () => {
    it('should set deletedAt, isActive=false, and revoke sessions in transaction', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
        isActive: false,
      });

      const result = await service.softDeleteAccount('user-1');

      expect(result.message).toBe('Account successfully deleted');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            isActive: false,
          }),
        }),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
