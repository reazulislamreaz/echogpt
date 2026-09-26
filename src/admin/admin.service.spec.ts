import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleType } from '../roles/enums/role.enum';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let usersService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      subscription: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn() },
      aIProvider: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({ slug: 'OPENAI' }),
      },
      conversation: { count: jest.fn().mockResolvedValue(1) },
      message: { count: jest.fn().mockResolvedValue(1) },
      webSearch: { count: jest.fn().mockResolvedValue(1) },
      aPIUsageLog: {
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 1 },
          _sum: { totalTokens: 10, promptTokens: 4, completionTokens: 6 },
          _avg: { responseTimeMs: 12 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      session: { updateMany: jest.fn() },
      isHealthy: jest.fn().mockResolvedValue(true),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };

    usersService = {
      findById: jest.fn(),
      toSafeUser: jest.fn((u: Record<string, unknown>) => ({
        id: u.id,
        email: u.email,
        role: (u.role as { name?: string } | undefined)?.name ?? 'USER',
        isActive: u.isActive,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        {
          provide: RedisService,
          useValue: { isAvailable: jest.fn().mockReturnValue(false) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('returns nested dashboard statistics', async () => {
    const result = await service.getDashboardStats();
    expect(result.users).toBeDefined();
    expect(result.subscriptions).toBeDefined();
    expect(result.providers.defaultProvider).toBe('OPENAI');
    expect(result.system.database).toBe('up');
  });

  it('returns system health without secrets', async () => {
    const result = await service.getSystemHealth();
    expect(result.database.status).toBe('connected');
    expect(JSON.stringify(result)).not.toMatch(/apiKey|password|secret/i);
  });

  it('deactivates a user and revokes sessions', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      deletedAt: null,
      isActive: true,
      role: { name: RoleType.USER },
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      isActive: false,
      role: { name: 'USER' },
    });
    prisma.session.updateMany.mockResolvedValue({ count: 2 });

    await service.updateUserStatus('user-1', false);

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
      }),
    );
  });

  it('prevents demoting the last active administrator', async () => {
    usersService.findById.mockResolvedValue({
      id: 'admin-1',
      deletedAt: null,
      isActive: true,
      role: { name: RoleType.ADMIN },
    });
    prisma.user.count.mockResolvedValue(1);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-user', name: RoleType.USER });

    await expect(service.updateUserRole('other-admin', 'admin-1', RoleType.USER)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws when updating missing user', async () => {
    usersService.findById.mockResolvedValue(null);
    await expect(service.updateUserStatus('missing', false)).rejects.toThrow(NotFoundException);
  });

  it('lists usage logs with sanitized error messages', async () => {
    prisma.aPIUsageLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        userId: 'user-1',
        requestId: 'req-1',
        endpoint: '/api/v1/web-search',
        method: 'POST',
        provider: 'mock',
        model: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        statusCode: 502,
        responseTimeMs: 12,
        ipAddress: '127.0.0.1',
        errorMessage: 'Bearer sk-secret-token failed',
        createdAt: new Date(),
      },
    ]);
    prisma.aPIUsageLog.count.mockResolvedValue(1);

    const result = await service.getUsageLogs({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].errorMessage).not.toContain('sk-secret');
    expect(result.items[0].errorMessage).toContain('[redacted]');
  });

  it('includes usage filters in the daily aggregation query', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';

    await service.getUsageAnalytics({ userId, provider: 'OPENAI' });

    const serialized = JSON.stringify(prisma.$queryRaw.mock.calls);
    expect(serialized).toContain(userId);
    expect(serialized).toContain('OPENAI');
  });
});
