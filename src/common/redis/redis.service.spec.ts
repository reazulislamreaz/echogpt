import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockRedis = {
  on: jest.fn(),
  connect: jest.fn(),
  ping: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  pttl: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('RedisService', () => {
  const createService = async (overrides: Record<string, unknown> = {}) => {
    const configMap: Record<string, unknown> = {
      'app.redis.host': '127.0.0.1',
      'app.redis.port': 6379,
      'app.redis.password': '',
      'app.redis.db': 0,
      'app.redis.keyPrefix': 'echogpt:',
      'app.redis.connectTimeoutMs': 2000,
      'app.redis.commandTimeoutMs': 1000,
      ...overrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key in configMap ? configMap[key] : fallback,
            ),
          },
        },
      ],
    }).compile();

    return module.get(RedisService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.connect.mockResolvedValue(undefined);
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.pttl.mockResolvedValue(1000);
  });

  it('starts disabled when REDIS_HOST is empty', async () => {
    const service = await createService({ 'app.redis.host': '' });
    expect(service.isAvailable()).toBe(false);
    await expect(service.get('k')).resolves.toBeNull();
    await expect(service.set('k', 'v')).resolves.toBe(false);
  });

  it('returns null on get failure without throwing', async () => {
    mockRedis.connect.mockRejectedValue(new Error('down'));
    const service = await createService();
    mockRedis.get.mockRejectedValue(new Error('get failed'));
    await expect(service.get('k')).resolves.toBeNull();
  });

  it('returns false on set failure without throwing', async () => {
    const service = await createService();
    mockRedis.set.mockRejectedValue(new Error('set failed'));
    await expect(service.set('k', 'v', 60)).resolves.toBe(false);
  });

  it('returns false on delete failure without throwing', async () => {
    const service = await createService();
    mockRedis.del.mockRejectedValue(new Error('del failed'));
    await expect(service.del('k')).resolves.toBe(false);
  });

  it('stores and reads json values when Redis works', async () => {
    const service = await createService();
    mockRedis.get.mockResolvedValue(JSON.stringify({ ok: true }));
    await expect(service.setJson('k', { ok: true }, 30)).resolves.toBe(true);
    await expect(service.getJson<{ ok: boolean }>('k')).resolves.toEqual({ ok: true });
  });
});
