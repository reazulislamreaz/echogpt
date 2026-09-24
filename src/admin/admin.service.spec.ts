import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let usersService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn(),
        update: jest.fn(),
      },
      subscription: { count: jest.fn() },
      aIProvider: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      conversation: { count: jest.fn() },
      message: { count: jest.fn() },
      webSearch: { count: jest.fn() },
      aPIUsageLog: {
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
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
      toSafeUser: jest.fn((u: unknown) => u),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('returns dashboard statistics', async () => {
    prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    prisma.subscription.count.mockResolvedValue(7);
    prisma.aIProvider.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.conversation.count.mockResolvedValue(20);
    prisma.message.count.mockResolvedValue(100);
    prisma.webSearch.count.mockResolvedValue(15);
    prisma.aPIUsageLog.count
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(180)
      .mockResolvedValueOnce(20);
    prisma.aPIUsageLog.aggregate.mockResolvedValue({ _sum: { totalTokens: 5000 } });

    const result = await service.getDashboardStats();

    expect(result.totalUsers).toBe(10);
    expect(result.activeUsers).toBe(8);
    expect(result.totalTokensUsed).toBe(5000);
    expect(result.generatedAt).toBeDefined();
  });

  it('returns system health without secrets', async () => {
    prisma.aIProvider.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    prisma.aIProvider.findFirst.mockResolvedValue({ slug: 'OPENAI' });

    const result = await service.getSystemHealth();

    expect(result.database).toBe('up');
    expect(result.providers.defaultProvider).toBe('OPENAI');
    expect(JSON.stringify(result)).not.toMatch(/apiKey|password|secret/i);
  });

  it('deactivates a user and revokes sessions', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      deletedAt: null,
      isActive: true,
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

  it('throws when updating missing user', async () => {
    usersService.findById.mockResolvedValue(null);
    await expect(service.updateUserStatus('missing', false)).rejects.toThrow(NotFoundException);
  });

  it('lists usage logs with pagination metadata', async () => {
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
        statusCode: 200,
        responseTimeMs: 12,
        ipAddress: '127.0.0.1',
        errorMessage: null,
        createdAt: new Date(),
      },
    ]);
    prisma.aPIUsageLog.count.mockResolvedValue(1);

    const result = await service.getUsageLogs({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});
