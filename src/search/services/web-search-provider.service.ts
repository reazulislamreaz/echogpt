import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NormalizedSearchResult,
  WebSearchExecutionResult,
  WebSearchProviderError,
  WebSearchProviderRequest,
} from '../interfaces/web-search.interface';

@Injectable()
export class WebSearchProviderService {
  private readonly logger = new Logger(WebSearchProviderService.name);
  private readonly mockSearch: boolean;
  private readonly providerName: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.mockSearch = this.configService.get<boolean>('app.webSearch.mock', false);
    this.providerName = (
      this.configService.get<string>('app.webSearch.provider', 'serper') ?? 'serper'
    ).toLowerCase();
    this.apiKey = this.configService.get<string>('app.webSearch.apiKey');
    this.baseUrl = (
      this.configService.get<string>('app.webSearch.baseUrl') ??
      this.defaultBaseUrl(this.providerName)
    ).replace(/\/+$/, '');
    this.defaultTimeoutMs = this.configService.get<number>('app.webSearch.requestTimeoutMs', 15000);
  }

  async search(request: WebSearchProviderRequest): Promise<WebSearchExecutionResult> {
    if (this.mockSearch) {
      return this.mockResults(request.query, request.limit);
    }

    if (!this.apiKey) {
      throw new WebSearchProviderError(
        'Web search provider is not configured. Set WEB_SEARCH_API_KEY or enable WEB_SEARCH_MOCK.',
        503,
      );
    }

    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;

    switch (this.providerName) {
      case 'serper':
        return this.searchSerper(request.query, request.limit, timeoutMs);
      case 'brave':
        return this.searchBrave(request.query, request.limit, timeoutMs);
      default:
        throw new WebSearchProviderError(
          `Unsupported web search provider: ${this.providerName}`,
          500,
        );
    }
  }

  private mockResults(query: string, limit: number): WebSearchExecutionResult {
    const results: NormalizedSearchResult[] = Array.from(
      { length: Math.min(limit, 3) },
      (_, index) => ({
        title: `Mock result ${index + 1} for ${query}`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}&n=${index + 1}`,
        snippet: `Mock snippet describing ${query} (result ${index + 1}).`,
      }),
    );

    return { provider: 'mock', results };
  }

  private async searchSerper(
    query: string,
    limit: number,
    timeoutMs: number,
  ): Promise<WebSearchExecutionResult> {
    const response = await this.fetchJson(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: limit }),
      timeoutMs,
    });

    const organic = Array.isArray(response.organic) ? response.organic : [];
    const results = organic
      .map((item) => this.normalizeItem(item))
      .filter((item): item is NormalizedSearchResult => item !== null)
      .slice(0, limit);

    return { provider: 'serper', results };
  }

  private async searchBrave(
    query: string,
    limit: number,
    timeoutMs: number,
  ): Promise<WebSearchExecutionResult> {
    const url = new URL(`${this.baseUrl}/res/v1/web/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));

    const response = await this.fetchJson(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': this.apiKey as string,
      },
      timeoutMs,
    });

    const web = response.web as { results?: unknown[] } | undefined;
    const rawResults = Array.isArray(web?.results) ? web.results : [];
    const results = rawResults
      .map((item) => this.normalizeItem(item))
      .filter((item): item is NormalizedSearchResult => item !== null)
      .slice(0, limit);

    return { provider: 'brave', results };
  }

  private normalizeItem(item: unknown): NormalizedSearchResult | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const url =
      (typeof record.link === 'string' && record.link.trim()) ||
      (typeof record.url === 'string' && record.url.trim()) ||
      '';
    const snippet =
      (typeof record.snippet === 'string' && record.snippet.trim()) ||
      (typeof record.description === 'string' && record.description.trim()) ||
      '';

    if (!title || !url) {
      return null;
    }

    return { title, url, snippet };
  }

  private defaultBaseUrl(provider: string): string {
    if (provider === 'brave') {
      return 'https://api.search.brave.com';
    }
    return 'https://google.serper.dev';
  }

  private async fetchJson(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      timeoutMs: number;
    },
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }

      if (!response.ok) {
        this.logger.warn(`Web search provider HTTP ${response.status}`);
        if (response.status === 401 || response.status === 403) {
          throw new WebSearchProviderError(
            'Web search provider rejected the configured credentials',
            502,
          );
        }
        if (response.status === 429) {
          throw new WebSearchProviderError('Web search provider rate limit exceeded', 502);
        }
        throw new WebSearchProviderError('Web search provider request failed', 502);
      }

      return parsed;
    } catch (error) {
      if (error instanceof WebSearchProviderError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        throw new WebSearchProviderError('Web search provider request timed out', 504);
      }
      throw new WebSearchProviderError('Unable to reach web search provider', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}
