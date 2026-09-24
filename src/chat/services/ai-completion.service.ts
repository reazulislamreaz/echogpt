import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderRequestError,
  ChatCompletionRequest,
  ChatCompletionResult,
} from '../interfaces/ai-completion.interface';

@Injectable()
export class AiCompletionService {
  private readonly logger = new Logger(AiCompletionService.name);
  private readonly mockCompletions: boolean;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.mockCompletions = this.configService.get<boolean>('app.ai.mockCompletions', false);
    this.defaultTimeoutMs = this.configService.get<number>('app.ai.requestTimeoutMs', 30000);
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (this.mockCompletions) {
      const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
      return {
        content: `Mock response to: ${lastUser?.content?.slice(0, 200) ?? 'prompt'}`,
        model: request.model,
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      };
    }

    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;
    const slug = request.slug.toUpperCase();

    switch (slug) {
      case 'OPENAI':
        return this.completeOpenAi(request, timeoutMs);
      case 'CLAUDE':
      case 'ANTHROPIC':
        return this.completeClaude(request, timeoutMs);
      case 'GEMINI':
        return this.completeGemini(request, timeoutMs);
      default:
        throw new AiProviderRequestError(`Unsupported AI provider: ${slug}`, 400);
    }
  }

  private async completeOpenAi(
    request: ChatCompletionRequest,
    timeoutMs: number,
  ): Promise<ChatCompletionResult> {
    const root = (request.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const response = await this.fetchJson(`${root}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
      }),
      timeoutMs,
    });

    const choices = response.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AiProviderRequestError('OpenAI returned an empty response', 502);
    }

    const usage = response.usage as
      { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    return {
      content,
      model: typeof response.model === 'string' ? response.model : request.model,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
    };
  }

  private async completeClaude(
    request: ChatCompletionRequest,
    timeoutMs: number,
  ): Promise<ChatCompletionResult> {
    const root = (request.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const systemMessages = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await this.fetchJson(`${root}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: 1024,
        ...(systemMessages ? { system: systemMessages } : {}),
        messages,
      }),
      timeoutMs,
    });

    const contentBlocks = response.content as Array<{ type?: string; text?: string }> | undefined;
    const content = contentBlocks
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!content) {
      throw new AiProviderRequestError('Anthropic returned an empty response', 502);
    }

    const usage = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const promptTokens = usage?.input_tokens ?? null;
    const completionTokens = usage?.output_tokens ?? null;

    return {
      content,
      model: typeof response.model === 'string' ? response.model : request.model,
      promptTokens,
      completionTokens,
      totalTokens:
        promptTokens != null || completionTokens != null
          ? (promptTokens ?? 0) + (completionTokens ?? 0)
          : null,
    };
  }

  private async completeGemini(
    request: ChatCompletionRequest,
    timeoutMs: number,
  ): Promise<ChatCompletionResult> {
    const root = (request.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(
      /\/+$/,
      '',
    );
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

    const url = `${root}/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;

    const response = await this.fetchJson(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
      }),
      timeoutMs,
    });

    const candidates = response.candidates as
      Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const content = candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!content) {
      throw new AiProviderRequestError('Gemini returned an empty response', 502);
    }

    const usage = response.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
      | undefined;

    return {
      content,
      model: request.model,
      promptTokens: usage?.promptTokenCount ?? null,
      completionTokens: usage?.candidatesTokenCount ?? null,
      totalTokens: usage?.totalTokenCount ?? null,
    };
  }

  private async fetchJson(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body: string;
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
        this.logger.warn(`AI provider HTTP ${response.status} for ${new URL(url).origin}`);
        if (response.status === 401 || response.status === 403) {
          throw new AiProviderRequestError('AI provider rejected the configured credentials', 502);
        }
        if (response.status === 429) {
          throw new AiProviderRequestError('AI provider rate limit exceeded', 502);
        }
        throw new AiProviderRequestError('AI provider request failed', 502);
      }

      return parsed;
    } catch (error) {
      if (error instanceof AiProviderRequestError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        throw new AiProviderRequestError('AI provider request timed out', 504);
      }
      throw new AiProviderRequestError('Unable to reach AI provider', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}
