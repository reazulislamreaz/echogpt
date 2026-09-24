export interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchExecutionResult {
  provider: string;
  results: NormalizedSearchResult[];
}

export interface WebSearchProviderRequest {
  query: string;
  limit: number;
  timeoutMs: number;
}

export class WebSearchProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'WebSearchProviderError';
  }
}
