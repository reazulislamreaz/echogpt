import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { NormalizedSearchResult } from '../interfaces/web-search.interface';

export interface CachedSearchPayload {
  provider: string;
  results: NormalizedSearchResult[];
}

@Injectable()
export class SearchCacheService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>('app.webSearch.cacheTtlSeconds', 300);
  }

  buildKey(provider: string, query: string, limit: number): string {
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const digest = createHash('sha256')
      .update(`${provider.toLowerCase()}|${normalizedQuery}|${limit}`)
      .digest('hex')
      .slice(0, 32);
    return `search:v1:${digest}`;
  }

  async get(provider: string, query: string, limit: number): Promise<CachedSearchPayload | null> {
    if (this.ttlSeconds <= 0) {
      return null;
    }
    return this.redis.getJson<CachedSearchPayload>(this.buildKey(provider, query, limit));
  }

  async set(
    provider: string,
    query: string,
    limit: number,
    payload: CachedSearchPayload,
  ): Promise<void> {
    if (this.ttlSeconds <= 0 || !payload.results.length) {
      return;
    }
    await this.redis.setJson(this.buildKey(provider, query, limit), payload, this.ttlSeconds);
  }
}
