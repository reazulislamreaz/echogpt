import { ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpMethod, Prisma, WebSearch } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageService } from '../usage/usage.service';
import { CreateWebSearchDto } from './dto/create-web-search.dto';
import {
  RecentSearchResponseDto,
  SearchSuggestionsResponseDto,
  WebSearchResponseDto,
} from './dto/web-search-response.dto';
import { NormalizedSearchResult, WebSearchProviderError } from './interfaces/web-search.interface';
import { WebSearchProviderService } from './services/web-search-provider.service';

@Injectable()
export class SearchService {
  private readonly requestTimeoutMs: number;
  private readonly defaultResultLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageService: UsageService,
    private readonly webSearchProvider: WebSearchProviderService,
    private readonly configService: ConfigService,
  ) {
    this.requestTimeoutMs = this.configService.get<number>('app.webSearch.requestTimeoutMs', 15000);
    this.defaultResultLimit = this.configService.get<number>('app.webSearch.defaultLimit', 10);
  }

  async search(
    userId: string,
    dto: CreateWebSearchDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<WebSearchResponseDto> {
    await this.subscriptionsService.checkRequestAllowance(userId);

    const query = dto.query.trim();
    const limit = dto.limit ?? this.defaultResultLimit;
    const requestId = randomUUID();
    const started = Date.now();
    const endpoint = '/api/v1/web-search';

    let providerName =
      this.configService.get<string>('app.webSearch.provider', 'serper') ?? 'serper';
    let statusCode = 200;
    let errorMessage: string | null = null;
    let execution;

    try {
      execution = await this.webSearchProvider.search({
        query,
        limit,
        timeoutMs: this.requestTimeoutMs,
      });
      providerName = execution.provider;
    } catch (error) {
      const responseTimeMs = Date.now() - started;
      if (error instanceof WebSearchProviderError) {
        statusCode = error.statusCode;
        errorMessage = error.message;
      } else {
        statusCode = 502;
        errorMessage = 'Web search provider request failed';
      }

      await this.usageService.recordUsage({
        userId,
        requestId,
        endpoint,
        method: HttpMethod.POST,
        provider: providerName,
        statusCode,
        responseTimeMs,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        errorMessage,
      });

      if (error instanceof WebSearchProviderError) {
        throw new HttpException(error.message, error.statusCode);
      }
      throw new HttpException('Web search provider request failed', 502);
    }

    const responseTimeMs = Date.now() - started;
    const results = execution.results;

    const saved = await this.prisma.webSearch.create({
      data: {
        userId,
        query,
        provider: execution.provider,
        results: results as unknown as Prisma.InputJsonValue,
        resultCount: results.length,
      },
    });

    await this.usageService.recordUsage({
      userId,
      requestId,
      endpoint,
      method: HttpMethod.POST,
      provider: execution.provider,
      statusCode: 200,
      responseTimeMs,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.toSafeSearch(saved);
  }

  async listHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: WebSearchResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const skip = (page - 1) * limit;
    const where: Prisma.WebSearchWhereInput = { userId };

    const [rows, total] = await Promise.all([
      this.prisma.webSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webSearch.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toSafeSearch(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async listRecent(userId: string, limit = 10): Promise<RecentSearchResponseDto[]> {
    const rows = await this.prisma.webSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        query: true,
        provider: true,
        resultCount: true,
        createdAt: true,
      },
    });

    return rows;
  }

  async getSuggestions(
    userId: string,
    q?: string,
    limit = 10,
  ): Promise<SearchSuggestionsResponseDto> {
    const prefix = q?.trim().toLowerCase() ?? '';

    const rows = await this.prisma.webSearch.findMany({
      where: {
        userId,
        ...(prefix
          ? {
              query: {
                contains: prefix,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { query: true },
    });

    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const row of rows) {
      const normalized = row.query.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push(normalized);
      if (suggestions.length >= limit) {
        break;
      }
    }

    return { suggestions };
  }

  async getOne(userId: string, searchId: string): Promise<WebSearchResponseDto> {
    const row = await this.getOwnedSearch(userId, searchId);
    return this.toSafeSearch(row);
  }

  async deleteOne(userId: string, searchId: string): Promise<{ message: string }> {
    await this.getOwnedSearch(userId, searchId);
    await this.prisma.webSearch.delete({ where: { id: searchId } });
    return { message: 'Search record deleted successfully' };
  }

  private async getOwnedSearch(userId: string, searchId: string): Promise<WebSearch> {
    const row = await this.prisma.webSearch.findUnique({ where: { id: searchId } });

    if (!row) {
      throw new NotFoundException('Search record not found');
    }

    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this search record');
    }

    return row;
  }

  toSafeSearch(row: WebSearch): WebSearchResponseDto {
    return {
      id: row.id,
      query: row.query,
      provider: row.provider,
      results: this.parseResults(row.results),
      resultCount: row.resultCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseResults(value: Prisma.JsonValue): NormalizedSearchResult[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const title = typeof record.title === 'string' ? record.title : '';
        const url = typeof record.url === 'string' ? record.url : '';
        const snippet = typeof record.snippet === 'string' ? record.snippet : '';
        if (!title || !url) {
          return null;
        }
        return { title, url, snippet };
      })
      .filter((item): item is NormalizedSearchResult => item !== null);
  }
}
