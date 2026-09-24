import { FailOpenThrottlerStorage } from './fail-open-throttler.storage';
import { RedisService } from './redis.service';

describe('FailOpenThrottlerStorage', () => {
  it('uses Redis counters when available', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(2),
      pttl: jest.fn().mockResolvedValue(5000),
    } as unknown as RedisService;

    const storage = new FailOpenThrottlerStorage(redis);
    const result = await storage.increment('ip', 60000, 100, 0, 'default');

    expect(result.totalHits).toBe(2);
    expect(result.isBlocked).toBe(false);
    expect(redis.incr).toHaveBeenCalled();
  });

  it('falls back to memory when Redis incr fails', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(null),
      pttl: jest.fn(),
    } as unknown as RedisService;

    const storage = new FailOpenThrottlerStorage(redis);
    const first = await storage.increment('ip', 60000, 2, 0, 'default');
    const second = await storage.increment('ip', 60000, 2, 0, 'default');
    const third = await storage.increment('ip', 60000, 2, 0, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(third.isBlocked).toBe(true);
  });

  it('sweeps expired memory entries to avoid unbounded growth', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(null),
      pttl: jest.fn(),
    } as unknown as RedisService;

    const storage = new FailOpenThrottlerStorage(redis);
    await storage.increment('a', 1, 100, 0, 'default');
    expect(storage.memorySize).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await storage.increment('b', 60000, 100, 0, 'default');
    expect(storage.memorySize).toBe(1);
  });
});
