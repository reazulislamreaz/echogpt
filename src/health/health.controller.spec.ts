import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { isHealthy: jest.Mock };

  beforeEach(async () => {
    prisma = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RedisService,
          useValue: { isAvailable: jest.fn().mockReturnValue(false) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.redis.host') return '';
              if (key === 'app.smtp.host') return '';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health status with database connectivity', async () => {
    const res = { status: jest.fn() } as unknown as Response;
    const result = await controller.check(res);
    expect(result.status).toBe('ok');
    expect(result.service).toBe('echogpt-backend');
    expect(result.database).toBe('up');
    expect(result.redis).toBe('disabled');
    expect(result.smtp).toBe('unconfigured');
    expect(result.timestamp).toBeDefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 503 when database is down without marking optional deps as critical', async () => {
    prisma.isHealthy.mockResolvedValue(false);
    const res = { status: jest.fn() } as unknown as Response;
    const result = await controller.check(res);
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('down');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
