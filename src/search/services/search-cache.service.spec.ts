import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../common/redis/redis.service';
import { SearchCacheService } from './search-cache.service';

describe('SearchCacheService', () => {
  let service: SearchCacheService;
  let redis: { getJson: jest.Mock; setJson: jest.Mock };

  beforeEach(async () => {
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchCacheService,
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'app.webSearch.cacheTtlSeconds') return 300;
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SearchCacheService);
  });

  it('builds deterministic keys that ignore query case/spacing', () => {
    const a = service.buildKey('serper', 'Hello World', 10);
    const b = service.buildKey('serper', '  hello   world ', 10);
    const c = service.buildKey('brave', 'Hello World', 10);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('isolates cache by limit', () => {
    expect(service.buildKey('serper', 'q', 5)).not.toBe(service.buildKey('serper', 'q', 10));
  });

  it('does not include user identifiers in cache keys', () => {
    const key = service.buildKey('serper', 'nestjs', 10);
    expect(key).not.toMatch(/user/i);
    expect(key.startsWith('search:v1:')).toBe(true);
  });

  it('skips caching empty results', async () => {
    await service.set('serper', 'q', 10, { provider: 'serper', results: [] });
    expect(redis.setJson).not.toHaveBeenCalled();
  });
});
