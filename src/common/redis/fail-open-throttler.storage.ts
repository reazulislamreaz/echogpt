import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

/**
 * Prefer Redis for distributed throttling; fall open to in-memory when Redis is down.
 * Memory entries are swept on each increment to avoid unbounded growth during Redis outages.
 */
@Injectable()
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly memory = new Map<string, { totalHits: number; expiresAt: number }>();
  private readonly maxMemoryEntries = 10_000;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));

    const redisCount = await this.redis.incr(redisKey, ttlSeconds);
    if (redisCount !== null) {
      const pttl = (await this.redis.pttl(redisKey)) ?? ttl;
      const timeToExpire = pttl > 0 ? pttl : ttl;
      const isBlocked = redisCount > limit;
      const timeToBlockExpire = isBlocked && blockDuration > 0 ? blockDuration : 0;

      return {
        totalHits: redisCount,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };
    }

    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  /** Exposed for tests. */
  get memorySize(): number {
    return this.memory.size;
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    this.sweepExpired(now);

    const memoryKey = `${throttlerName}:${key}`;
    let entry = this.memory.get(memoryKey);

    if (!entry || entry.expiresAt <= now) {
      entry = { totalHits: 0, expiresAt: now + ttl };
    }

    entry.totalHits += 1;
    this.memory.set(memoryKey, entry);

    if (this.memory.size > this.maxMemoryEntries) {
      this.evictOldest();
    }

    const timeToExpire = Math.max(0, entry.expiresAt - now);
    const isBlocked = entry.totalHits > limit;
    const timeToBlockExpire = isBlocked && blockDuration > 0 ? blockDuration : 0;

    return {
      totalHits: entry.totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  private sweepExpired(now: number): void {
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) {
        this.memory.delete(key);
      }
    }
  }

  private evictOldest(): void {
    const overflow = this.memory.size - this.maxMemoryEntries;
    if (overflow <= 0) {
      return;
    }
    let removed = 0;
    for (const key of this.memory.keys()) {
      this.memory.delete(key);
      removed += 1;
      if (removed >= overflow) {
        break;
      }
    }
  }
}
