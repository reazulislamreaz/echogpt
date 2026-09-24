import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WebSearchProviderError } from '../interfaces/web-search.interface';
import { WebSearchProviderService } from './web-search-provider.service';

describe('WebSearchProviderService', () => {
  let service: WebSearchProviderService;
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    configValues = {
      'app.webSearch.mock': true,
      'app.webSearch.provider': 'serper',
      'app.webSearch.apiKey': undefined,
      'app.webSearch.baseUrl': undefined,
      'app.webSearch.requestTimeoutMs': 15000,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key in configValues ? configValues[key] : fallback,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(WebSearchProviderService);
  });

  it('returns mock results when WEB_SEARCH_MOCK is enabled', async () => {
    const result = await service.search({
      query: 'EchoGPT',
      limit: 5,
      timeoutMs: 5000,
    });

    expect(result.provider).toBe('mock');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].title).toContain('EchoGPT');
  });

  it('throws when provider is not mocked and API key is missing', async () => {
    configValues['app.webSearch.mock'] = false;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key in configValues ? configValues[key] : fallback,
            ),
          },
        },
      ],
    }).compile();

    const liveService = module.get(WebSearchProviderService);

    await expect(
      liveService.search({ query: 'test', limit: 5, timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(WebSearchProviderError);
  });
});
