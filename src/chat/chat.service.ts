import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Conversation, HttpMethod, Message, MessageRole, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageService } from '../usage/usage.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  ConversationDetailResponseDto,
  ConversationResponseDto,
  SendMessageResponseDto,
} from './dto/conversation-response.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AiProviderRequestError } from './interfaces/ai-completion.interface';
import { AiCompletionService } from './services/ai-completion.service';

const DEFAULT_MODELS: Record<string, string> = {
  OPENAI: 'gpt-4o-mini',
  CLAUDE: 'claude-3-5-haiku-latest',
  ANTHROPIC: 'claude-3-5-haiku-latest',
  GEMINI: 'gemini-1.5-flash',
};

@Injectable()
export class ChatService {
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageService: UsageService,
    private readonly aiCompletionService: AiCompletionService,
    private readonly configService: ConfigService,
  ) {
    this.requestTimeoutMs = this.configService.get<number>('app.ai.requestTimeoutMs', 30000);
  }

  async createConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    if (dto.providerId) {
      await this.ensureActiveProvider(dto.providerId);
    }

    const created = await this.prisma.conversation.create({
      data: {
        userId,
        title: dto.title?.trim() || 'New Conversation',
        providerId: dto.providerId ?? null,
        model: dto.model?.trim() || null,
      },
    });

    return this.toSafeConversation(created);
  }

  async listConversations(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: ConversationResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const skip = (page - 1) * limit;
    const where: Prisma.ConversationWhereInput = {
      userId,
      deletedAt: null,
    };

    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return {
      items: rows.map((c) => this.toSafeConversation(c)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponseDto> {
    const conversation = await this.getOwnedConversation(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return {
      ...this.toSafeConversation(conversation),
      messages: messages.map((m) => this.toSafeMessage(m)),
    };
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    await this.getOwnedConversation(userId, conversationId);

    if (dto.providerId) {
      await this.ensureActiveProvider(dto.providerId);
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || 'New Conversation' } : {}),
        ...(dto.providerId !== undefined ? { providerId: dto.providerId } : {}),
        ...(dto.model !== undefined ? { model: dto.model?.trim() || null } : {}),
      },
    });

    return this.toSafeConversation(updated);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<{ message: string }> {
    await this.getOwnedConversation(userId, conversationId);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Conversation deleted successfully' };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    items: MessageResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    await this.getOwnedConversation(userId, conversationId);

    const skip = (page - 1) * limit;
    const where = { conversationId };

    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      items: rows.map((m) => this.toSafeMessage(m)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<SendMessageResponseDto> {
    const conversation = await this.getOwnedConversation(userId, conversationId);

    // Enforce usage limit before any provider call
    await this.subscriptionsService.checkRequestAllowance(userId);

    const providerId = dto.providerId ?? conversation.providerId;
    const credentials = await this.providersService.resolveChatCredentials(userId, providerId);
    const model =
      dto.model?.trim() ||
      conversation.model?.trim() ||
      DEFAULT_MODELS[credentials.provider.slug.toUpperCase()] ||
      'gpt-4o-mini';

    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { role: true, content: true },
    });

    const completionMessages = [
      ...history
        .filter((m) => m.role !== MessageRole.SYSTEM)
        .map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      { role: 'user' as const, content: dto.content },
    ];

    const requestId = randomUUID();
    const started = Date.now();
    let statusCode = 200;
    let errorMessage: string | null = null;
    let completion;

    try {
      completion = await this.aiCompletionService.complete({
        slug: credentials.provider.slug,
        baseUrl: credentials.baseUrl,
        apiKey: credentials.apiKey,
        model,
        messages: completionMessages,
        timeoutMs: this.requestTimeoutMs,
      });
    } catch (error) {
      const responseTimeMs = Date.now() - started;
      if (error instanceof AiProviderRequestError) {
        statusCode = error.statusCode;
        errorMessage = error.message;
      } else {
        statusCode = 502;
        errorMessage = 'AI provider request failed';
      }

      await this.usageService.safeRecordUsage({
        userId,
        requestId,
        endpoint: `/api/v1/conversations/${conversationId}/messages`,
        method: HttpMethod.POST,
        provider: credentials.provider.slug,
        model,
        statusCode,
        responseTimeMs,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        errorMessage,
      });

      if (error instanceof AiProviderRequestError) {
        throw new HttpException(error.message, error.statusCode);
      }
      throw new HttpException('AI provider request failed', 502);
    }

    const responseTimeMs = Date.now() - started;

    const shouldAutoTitle = conversation.title === 'New Conversation' && history.length === 0;

    const { userMessage, assistantMessage } = await this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content: dto.content,
          provider: credentials.provider.slug,
          model,
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: completion.content,
          provider: credentials.provider.slug,
          model: completion.model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          providerId: credentials.provider.id,
          model: completion.model,
          ...(shouldAutoTitle ? { title: this.buildTitleFromPrompt(dto.content) } : {}),
          updatedAt: new Date(),
        },
      });

      return { userMessage, assistantMessage };
    });

    await this.usageService.safeRecordUsage({
      userId,
      requestId,
      endpoint: `/api/v1/conversations/${conversationId}/messages`,
      method: HttpMethod.POST,
      provider: credentials.provider.slug,
      model: completion.model,
      promptTokens: completion.promptTokens ?? undefined,
      completionTokens: completion.completionTokens ?? undefined,
      totalTokens: completion.totalTokens ?? undefined,
      statusCode: 200,
      responseTimeMs,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      userMessage: this.toSafeMessage(userMessage),
      assistantMessage: this.toSafeMessage(assistantMessage),
    };
  }

  async *streamMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    meta?: { ipAddress?: string; userAgent?: string; signal?: AbortSignal },
  ): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    const conversation = await this.getOwnedConversation(userId, conversationId);
    await this.subscriptionsService.checkRequestAllowance(userId);

    const providerId = dto.providerId ?? conversation.providerId;
    const credentials = await this.providersService.resolveChatCredentials(userId, providerId);
    const model =
      dto.model?.trim() ||
      conversation.model?.trim() ||
      DEFAULT_MODELS[credentials.provider.slug.toUpperCase()] ||
      'gpt-4o-mini';

    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { role: true, content: true },
    });

    const completionMessages = [
      ...history
        .filter((m) => m.role !== MessageRole.SYSTEM)
        .map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      { role: 'user' as const, content: dto.content },
    ];

    const requestId = randomUUID();
    const started = Date.now();
    const endpoint = `/api/v1/conversations/${conversationId}/messages/stream`;
    let completion: Awaited<ReturnType<AiCompletionService['complete']>> | null = null;

    try {
      for await (const chunk of this.aiCompletionService.completeStream(
        {
          slug: credentials.provider.slug,
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          model,
          messages: completionMessages,
          timeoutMs: this.requestTimeoutMs,
        },
        meta?.signal,
      )) {
        if (chunk.type === 'delta') {
          yield { event: 'chunk', data: { text: chunk.text } };
        } else {
          completion = chunk.result;
        }
      }
    } catch (error) {
      const responseTimeMs = Date.now() - started;
      const aborted = error instanceof AiProviderRequestError && error.statusCode === 499;
      const statusCode = error instanceof AiProviderRequestError ? error.statusCode : 502;
      const errorMessage =
        error instanceof AiProviderRequestError ? error.message : 'AI provider request failed';

      if (!aborted) {
        await this.usageService.safeRecordUsage({
          userId,
          requestId,
          endpoint,
          method: HttpMethod.POST,
          provider: credentials.provider.slug,
          model,
          statusCode: statusCode === 499 ? 499 : statusCode,
          responseTimeMs,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          errorMessage,
        });
      }

      yield {
        event: 'error',
        data: {
          message: aborted ? 'Stream aborted' : errorMessage,
          statusCode: aborted ? 499 : statusCode,
        },
      };
      return;
    }

    if (!completion) {
      await this.usageService.safeRecordUsage({
        userId,
        requestId,
        endpoint,
        method: HttpMethod.POST,
        provider: credentials.provider.slug,
        model,
        statusCode: 502,
        responseTimeMs: Date.now() - started,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        errorMessage: 'AI stream completed without a final response',
      });
      yield {
        event: 'error',
        data: { message: 'AI stream completed without a final response', statusCode: 502 },
      };
      return;
    }

    const finalCompletion = completion;
    const responseTimeMs = Date.now() - started;
    const shouldAutoTitle = conversation.title === 'New Conversation' && history.length === 0;

    const { userMessage, assistantMessage } = await this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content: dto.content,
          provider: credentials.provider.slug,
          model,
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: finalCompletion.content,
          provider: credentials.provider.slug,
          model: finalCompletion.model,
          promptTokens: finalCompletion.promptTokens,
          completionTokens: finalCompletion.completionTokens,
          totalTokens: finalCompletion.totalTokens,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          providerId: credentials.provider.id,
          model: finalCompletion.model,
          ...(shouldAutoTitle ? { title: this.buildTitleFromPrompt(dto.content) } : {}),
          updatedAt: new Date(),
        },
      });

      return { userMessage, assistantMessage };
    });

    await this.usageService.safeRecordUsage({
      userId,
      requestId,
      endpoint,
      method: HttpMethod.POST,
      provider: credentials.provider.slug,
      model: finalCompletion.model,
      promptTokens: finalCompletion.promptTokens ?? undefined,
      completionTokens: finalCompletion.completionTokens ?? undefined,
      totalTokens: finalCompletion.totalTokens ?? undefined,
      statusCode: 200,
      responseTimeMs,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    yield {
      event: 'done',
      data: {
        userMessage: this.toSafeMessage(userMessage),
        assistantMessage: this.toSafeMessage(assistantMessage),
      },
    };
  }

  private async getOwnedConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.deletedAt !== null) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('You do not have access to this conversation');
    }

    return conversation;
  }

  private async ensureActiveProvider(providerId: string): Promise<void> {
    const provider = await this.prisma.aIProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      throw new NotFoundException('AI provider not found');
    }
    if (!provider.isActive) {
      throw new BadRequestException('AI provider is inactive');
    }
  }

  private buildTitleFromPrompt(content: string): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 60) {
      return cleaned || 'New Conversation';
    }
    return `${cleaned.slice(0, 57)}...`;
  }

  toSafeConversation(conversation: Conversation): ConversationResponseDto {
    return {
      id: conversation.id,
      title: conversation.title,
      providerId: conversation.providerId,
      model: conversation.model,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  toSafeMessage(message: Message): MessageResponseDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      provider: message.provider,
      model: message.model,
      promptTokens: message.promptTokens,
      completionTokens: message.completionTokens,
      totalTokens: message.totalTokens,
      createdAt: message.createdAt,
    };
  }
}
