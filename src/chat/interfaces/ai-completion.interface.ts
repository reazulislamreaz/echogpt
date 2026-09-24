export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  slug: string;
  baseUrl: string | null;
  apiKey: string;
  model: string;
  messages: ChatCompletionMessage[];
  timeoutMs: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  raw?: Record<string, unknown>;
}

export class AiProviderRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AiProviderRequestError';
  }
}
