import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderRequestError,
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatCompletionStreamChunk,
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

  async *completeStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    if (this.mockCompletions) {
      const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
      const content = `Mock streamed response to: ${lastUser?.content?.slice(0, 200) ?? 'prompt'}`;
      for (const part of content.match(/.{1,24}/g) ?? [content]) {
        if (signal?.aborted) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }
        yield { type: 'delta', text: part };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      yield {
        type: 'done',
        result: {
          content,
          model: request.model,
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };
      return;
    }

    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;
    const slug = request.slug.toUpperCase();

    switch (slug) {
      case 'OPENAI':
        yield* this.streamOpenAi(request, timeoutMs, signal);
        return;
      case 'CLAUDE':
      case 'ANTHROPIC':
        yield* this.streamClaude(request, timeoutMs, signal);
        return;
      case 'GEMINI':
        // Gemini stream API varies; fall back to non-stream then emit once.
        {
          const result = await this.completeGemini(request, timeoutMs, signal);
          if (signal?.aborted) {
            throw new AiProviderRequestError('AI stream aborted by client', 499);
          }
          yield { type: 'delta', text: result.content };
          yield { type: 'done', result };
        }
        return;
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
    signal?: AbortSignal,
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
      signal,
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

  private async *streamOpenAi(
    request: ChatCompletionRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    const root = (request.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const deadline = this.createDeadline(timeoutMs, signal);

    try {
      const response = await this.fetchRaw(`${root}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: deadline.signal,
        isClientAbort: () => Boolean(signal?.aborted),
      });

      let content = '';
      let model = request.model;
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;
      let totalTokens: number | null = null;

      for await (const event of this.iterateSse(response, deadline.signal)) {
        if (signal?.aborted) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }
        if (event === '[DONE]') {
          break;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(event) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (typeof parsed.model === 'string') {
          model = parsed.model;
        }

        const choices = parsed.choices as Array<{ delta?: { content?: string } }> | undefined;
        const delta = choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          yield { type: 'delta', text: delta };
        }

        const usage = parsed.usage as
          { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
        if (usage) {
          promptTokens = usage.prompt_tokens ?? promptTokens;
          completionTokens = usage.completion_tokens ?? completionTokens;
          totalTokens = usage.total_tokens ?? totalTokens;
        }
      }

      if (!content.trim()) {
        throw new AiProviderRequestError('OpenAI returned an empty stream', 502);
      }

      yield {
        type: 'done',
        result: {
          content,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
        },
      };
    } finally {
      deadline.dispose();
    }
  }

  private async *streamClaude(
    request: ChatCompletionRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    const root = (request.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const systemMessages = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const deadline = this.createDeadline(timeoutMs, signal);

    try {
      const response = await this.fetchRaw(`${root}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: 1024,
          stream: true,
          ...(systemMessages ? { system: systemMessages } : {}),
          messages,
        }),
        signal: deadline.signal,
        isClientAbort: () => Boolean(signal?.aborted),
      });

      let content = '';
      let model = request.model;
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;

      for await (const event of this.iterateSse(response, deadline.signal)) {
        if (signal?.aborted) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(event) as Record<string, unknown>;
        } catch {
          continue;
        }

        const type = typeof parsed.type === 'string' ? parsed.type : '';
        if (type === 'content_block_delta') {
          const delta = parsed.delta as { type?: string; text?: string } | undefined;
          if (delta?.text) {
            content += delta.text;
            yield { type: 'delta', text: delta.text };
          }
        } else if (type === 'message_start') {
          const message = parsed.message as { model?: string; usage?: { input_tokens?: number } };
          if (message?.model) {
            model = message.model;
          }
          promptTokens = message?.usage?.input_tokens ?? promptTokens;
        } else if (type === 'message_delta') {
          const usage = parsed.usage as { output_tokens?: number } | undefined;
          completionTokens = usage?.output_tokens ?? completionTokens;
        }
      }

      if (!content.trim()) {
        throw new AiProviderRequestError('Anthropic returned an empty stream', 502);
      }

      yield {
        type: 'done',
        result: {
          content,
          model,
          promptTokens,
          completionTokens,
          totalTokens:
            promptTokens != null || completionTokens != null
              ? (promptTokens ?? 0) + (completionTokens ?? 0)
              : null,
        },
      };
    } finally {
      deadline.dispose();
    }
  }

  private async *iterateSse(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
    if (!response.body) {
      throw new AiProviderRequestError('AI provider returned an empty stream body', 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', onAbort);

    try {
      while (true) {
        if (signal?.aborted) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) {
            continue;
          }
          const data = trimmed.slice(5).trim();
          if (data) {
            yield data;
          }
        }
      }

      const trailing = buffer.trim();
      if (trailing.startsWith('data:')) {
        const data = trailing.slice(5).trim();
        if (data) {
          yield data;
        }
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }
  }

  private createDeadline(
    timeoutMs: number,
    external?: AbortSignal,
  ): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (external) {
      if (external.aborted) {
        controller.abort();
      } else {
        external.addEventListener('abort', onAbort);
      }
    }

    return {
      signal: controller.signal,
      dispose: () => {
        clearTimeout(timeout);
        external?.removeEventListener('abort', onAbort);
      },
    };
  }

  private async fetchRaw(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body: string;
      signal: AbortSignal;
      isClientAbort?: () => boolean;
    },
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: options.signal,
      });

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

      return response;
    } catch (error) {
      if (error instanceof AiProviderRequestError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        if (options.isClientAbort?.()) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }
        throw new AiProviderRequestError('AI provider request timed out', 504);
      }
      throw new AiProviderRequestError('Unable to reach AI provider', 502);
    }
  }

  private async fetchJson(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body: string;
      timeoutMs: number;
      signal?: AbortSignal;
    },
  ): Promise<Record<string, unknown>> {
    const deadline = this.createDeadline(options.timeoutMs, options.signal);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: deadline.signal,
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
        if (options.signal?.aborted) {
          throw new AiProviderRequestError('AI stream aborted by client', 499);
        }
        throw new AiProviderRequestError('AI provider request timed out', 504);
      }
      throw new AiProviderRequestError('Unable to reach AI provider', 502);
    } finally {
      deadline.dispose();
    }
  }
}
