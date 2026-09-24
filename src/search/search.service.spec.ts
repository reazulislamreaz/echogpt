import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageService } from '../usage/usage.service';
import { SearchService } from './search.service';
import { WebSearchProviderService } from './services/web-search-provider.service';
import { WebSearchProviderError } from './interfaces/web-search.interface';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;
  let subscriptionsService: any;
  let usageService: any;
  let webSearchProvider: any;

  const searchRow = {
    id: 'search-1',
    userId: 'user-1',
    query: 'NestJS modules',
    provider: 'mock',
    results: [
      {
        title: 'NestJS Docs',
        url: 'https://docs.nestjs.com',
        snippet: 'Progressive Node.js framework',
      },
    ],
    resultCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      webSearch: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
    };

    subscriptionsService = {
      checkRequestAllowance: jest.fn().mockResolvedValue({ allowed: true }),
    };

    usageService = {
      recordUsage: jest.fn().mockResolvedValue({}),
    };

    webSearchProvider = {
      search: jest.fn().mockResolvedValue({
        provider: 'mock',
        results: searchRow.results,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: UsageService, useValue: usageService },
        { provide: WebSearchProviderService, useValue: webSearchProvider },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'app.webSearch.requestTimeoutMs') return 15000;
              if (key === 'app.webSearch.defaultLimit') return 10;
              if (key === 'app.webSearch.provider') return 'serper';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  it('performs a search, persists history, and records usage', async () => {
    prisma.webSearch.create.mockResolvedValue(searchRow);

    const result = await service.search('user-1', { query: 'NestJS modules' });

    expect(subscriptionsService.checkRequestAllowance).toHaveBeenCalledWith('user-1');
    expect(webSearchProvider.search).toHaveBeenCalled();
    expect(prisma.webSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          query: 'NestJS modules',
          provider: 'mock',
          resultCount: 1,
        }),
      }),
    );
    expect(usageService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        endpoint: '/api/v1/web-search',
        statusCode: 200,
        provider: 'mock',
      }),
    );
    expect(result.query).toBe('NestJS modules');
    expect(JSON.stringify(result)).not.toContain('sk-');
  });

  it('rejects when subscription limit is exceeded', async () => {
    subscriptionsService.checkRequestAllowance.mockRejectedValue(new HttpException('limit', 429));

    await expect(service.search('user-1', { query: 'NestJS' })).rejects.toThrow(HttpException);
    expect(webSearchProvider.search).not.toHaveBeenCalled();
  });

  it('records usage and throws on provider failure', async () => {
    webSearchProvider.search.mockRejectedValue(
      new WebSearchProviderError('Web search provider request failed', 502),
    );

    await expect(service.search('user-1', { query: 'NestJS' })).rejects.toThrow(HttpException);
    expect(usageService.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        errorMessage: 'Web search provider request failed',
      }),
    );
    expect(prisma.webSearch.create).not.toHaveBeenCalled();
  });

  it('blocks access to another user search record', async () => {
    prisma.webSearch.findUnique.mockResolvedValue({
      ...searchRow,
      userId: 'other-user',
    });

    await expect(service.getOne('user-1', 'search-1')).rejects.toThrow(ForbiddenException);
  });

  it('returns not found for missing search record', async () => {
    prisma.webSearch.findUnique.mockResolvedValue(null);
    await expect(service.getOne('user-1', 'search-1')).rejects.toThrow(NotFoundException);
  });

  it('returns suggestions only from the current user history', async () => {
    prisma.webSearch.findMany.mockResolvedValue([
      { query: 'NestJS modules' },
      { query: 'nestjs modules' },
      { query: 'NestJS guards' },
    ]);

    const result = await service.getSuggestions('user-1', 'nest', 10);

    expect(prisma.webSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
    expect(result.suggestions).toEqual(['NestJS modules', 'NestJS guards']);
  });

  it('lists recent searches ordered by createdAt desc', async () => {
    prisma.webSearch.findMany.mockResolvedValue([
      {
        id: 's1',
        query: 'latest',
        provider: 'mock',
        resultCount: 1,
        createdAt: new Date(),
      },
    ]);

    const result = await service.listRecent('user-1', 5);

    expect(prisma.webSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    );
    expect(result[0].query).toBe('latest');
  });
});
