import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private readonly keyPrefix: string;
  private readonly commandTimeoutMs: number;
  private available = false;
  private warnedUnavailable = false;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.redis.host')?.trim();
    this.keyPrefix =
      this.configService.get<string>('app.redis.keyPrefix', 'echogpt:') ?? 'echogpt:';
    this.commandTimeoutMs = this.configService.get<number>('app.redis.commandTimeoutMs', 1000);

    if (!host) {
      this.client = null;
      this.logger.log('Redis disabled (REDIS_HOST not set); running without cache.');
      return;
    }

    const port = this.configService.get<number>('app.redis.port', 6379);
    const password = this.configService.get<string>('app.redis.password') || undefined;
    const db = this.configService.get<number>('app.redis.db', 0);
    const connectTimeoutMs = this.configService.get<number>('app.redis.connectTimeoutMs', 2000);

    this.client = new Redis({
      host,
      port,
      password,
      db,
      connectTimeout: connectTimeoutMs,
      commandTimeout: this.commandTimeoutMs,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('ready', () => {
      this.available = true;
      this.warnedUnavailable = false;
      this.logger.log('Redis connected');
    });

    this.client.on('end', () => {
      this.available = false;
      this.warnUnavailable('connection ended');
    });

    this.client.on('error', () => {
      this.available = false;
      this.warnUnavailable('connection error');
    });

    void this.connectSafely();
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const value = await this.client.get(this.prefix(key));
      this.available = true;
      return value;
    } catch {
      this.available = false;
      this.warnUnavailable('get failed');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const fullKey = this.prefix(key);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(fullKey, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(fullKey, value);
      }
      this.available = true;
      return true;
    } catch {
      this.available = false;
      this.warnUnavailable('set failed');
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.del(this.prefix(key));
      this.available = true;
      return true;
    } catch {
      this.available = false;
      this.warnUnavailable('delete failed');
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    try {
      return await this.set(key, JSON.stringify(value), ttlSeconds);
    } catch {
      return false;
    }
  }

  async incr(key: string, ttlSeconds?: number): Promise<number | null> {
    if (!this.client) {
      return null;
    }

    try {
      const fullKey = this.prefix(key);
      const count = await this.client.incr(fullKey);
      if (count === 1 && ttlSeconds && ttlSeconds > 0) {
        await this.client.expire(fullKey, ttlSeconds);
      }
      this.available = true;
      return count;
    } catch {
      this.available = false;
      this.warnUnavailable('incr failed');
      return null;
    }
  }

  async pttl(key: string): Promise<number | null> {
    if (!this.client) {
      return null;
    }

    try {
      const ttl = await this.client.pttl(this.prefix(key));
      this.available = true;
      return ttl;
    } catch {
      this.available = false;
      return null;
    }
  }

  onModuleDestroy(): void {
    if (!this.client) {
      return;
    }

    try {
      this.client.disconnect();
    } catch {
      // ignore shutdown errors
    }
  }

  private prefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async connectSafely(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.connect();
      await this.client.ping();
      this.available = true;
      this.logger.log('Redis ready');
    } catch {
      this.available = false;
      this.warnUnavailable('startup connect failed');
    }
  }

  private warnUnavailable(reason: string): void {
    if (this.warnedUnavailable) {
      return;
    }
    this.warnedUnavailable = true;
    this.logger.warn(`Redis unavailable (${reason}); running without cache.`);
  }
}
