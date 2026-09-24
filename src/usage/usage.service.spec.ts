import { Test, TestingModule } from '@nestjs/testing';
import { HttpMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from './usage.service';

describe('UsageService', () => {
  let service: UsageService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      aPIUsageLog: {
        count: jest.fn().mockResolvedValue(15),
        create: jest.fn().mockImplementation((args) => ({
          id: 'log-uuid',
          ...args.data,
          createdAt: new Date(),
        })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsageService>(UsageService);
    prisma = module.get(PrismaService);
  });

  describe('getUsageCount', () => {
    it('should aggregate count in database for the given user and interval', async () => {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = new Date();

      const count = await service.getUsageCount('user-1', start, end);
      expect(count).toBe(15);
      expect(prisma.aPIUsageLog.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          statusCode: {
            gte: 200,
            lt: 400,
          },
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      });
    });

    it('should return 0 when userId is empty', async () => {
      const count = await service.getUsageCount('', new Date(), new Date());
      expect(count).toBe(0);
      expect(prisma.aPIUsageLog.count).not.toHaveBeenCalled();
    });
  });

  describe('recordUsage', () => {
    it('should create an APIUsageLog record with computed total tokens', async () => {
      const res = await service.recordUsage({
        userId: 'user-1',
        endpoint: '/api/v1/chat/completions',
        method: HttpMethod.POST,
        provider: 'OPENAI',
        model: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        statusCode: 200,
        responseTimeMs: 350,
      });

      expect(res.userId).toBe('user-1');
      expect(res.totalTokens).toBe(150);
      expect(prisma.aPIUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          endpoint: '/api/v1/chat/completions',
          totalTokens: 150,
          statusCode: 200,
        }),
      });
    });
  });
});
