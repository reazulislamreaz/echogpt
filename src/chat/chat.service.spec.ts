import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsageService } from '../usage/usage.service';
import { ChatService } from './chat.service';
import { AiCompletionService } from './services/ai-completion.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: any;
  let providersService: any;
  let subscriptionsService: any;
  let usageService: any;
  let aiCompletionService: any;

  const conversation = {
    id: 'conv-1',
    userId: 'user-1',
    providerId: 'provider-1',
    title: 'New Conversation',
    model: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      conversation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      aIProvider: {
        findUnique: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };

    providersService = {
      resolveChatCredentials: jest.fn().mockResolvedValue({
        provider: {
          id: 'provider-1',
          slug: 'OPENAI',
          baseUrl: 'https://api.openai.com/v1',
          isActive: true,
        },
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
      }),
    };

    subscriptionsService = {
      checkRequestAllowance: jest.fn().mockResolvedValue({ allowed: true }),
    };

    usageService = {
      safeRecordUsage: jest.fn().mockResolvedValue({}),
    };

    aiCompletionService = {
      complete: jest.fn().mockResolvedValue({
        content: 'Hello from AI',
        model: 'gpt-4o-mini',
        promptTokens: 5,
        completionTokens: 7,
        totalTokens: 12,
      }),
      completeStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProvidersService, useValue: providersService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: UsageService, useValue: usageService },
        { provide: AiCompletionService, useValue: aiCompletionService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(30000) },
        },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe('conversations', () => {
    it('creates a conversation for the authenticated user', async () => {
      prisma.conversation.create.mockResolvedValue(conversation);
      const result = await service.createConversation('user-1', { title: 'New Conversation' });
      expect(result.id).toBe('conv-1');
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('rejects access to another user conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversation,
        userId: 'other-user',
      });
      await expect(service.getConversation('user-1', 'conv-1')).rejects.toThrow(ForbiddenException);
    });

    it('returns not found for missing conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getConversation('user-1', 'conv-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage', () => {
    it('persists user and assistant messages and records usage', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.create
        .mockResolvedValueOnce({
          id: 'msg-user',
          conversationId: 'conv-1',
          role: MessageRole.USER,
          content: 'Hi',
          provider: 'OPENAI',
          model: 'gpt-4o-mini',
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: null,
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant',
          conversationId: 'conv-1',
          role: MessageRole.ASSISTANT,
          content: 'Hello from AI',
          provider: 'OPENAI',
          model: 'gpt-4o-mini',
          promptTokens: 5,
          completionTokens: 7,
          totalTokens: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: null,
        });
      prisma.conversation.update.mockResolvedValue(conversation);

      const result = await service.sendMessage('user-1', 'conv-1', { content: 'Hi' });

      expect(subscriptionsService.checkRequestAllowance).toHaveBeenCalledWith('user-1');
      expect(providersService.resolveChatCredentials).toHaveBeenCalled();
      expect(aiCompletionService.complete).toHaveBeenCalled();
      expect(result.userMessage.content).toBe('Hi');
      expect(result.assistantMessage.content).toBe('Hello from AI');
      expect(usageService.safeRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          provider: 'OPENAI',
          statusCode: 200,
        }),
      );
      expect(JSON.stringify(result)).not.toContain('sk-test');
    });

    it('rejects when subscription limit is exceeded', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation);
      subscriptionsService.checkRequestAllowance.mockRejectedValue(new HttpException('limit', 429));

      await expect(service.sendMessage('user-1', 'conv-1', { content: 'Hi' })).rejects.toThrow(
        HttpException,
      );
      expect(aiCompletionService.complete).not.toHaveBeenCalled();
    });
  });

  describe('streamMessage', () => {
    it('emits chunks then done and records successful usage', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.create
        .mockResolvedValueOnce({
          id: 'msg-user',
          conversationId: 'conv-1',
          role: MessageRole.USER,
          content: 'Hi',
          provider: 'OPENAI',
          model: 'gpt-4o-mini',
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: null,
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant',
          conversationId: 'conv-1',
          role: MessageRole.ASSISTANT,
          content: 'Hello streamed',
          provider: 'OPENAI',
          model: 'gpt-4o-mini',
          promptTokens: 5,
          completionTokens: 7,
          totalTokens: 12,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: null,
        });
      prisma.conversation.update.mockResolvedValue(conversation);

      aiCompletionService.completeStream.mockImplementation(async function* () {
        yield { type: 'delta', text: 'Hello ' };
        yield { type: 'delta', text: 'streamed' };
        yield {
          type: 'done',
          result: {
            content: 'Hello streamed',
            model: 'gpt-4o-mini',
            promptTokens: 5,
            completionTokens: 7,
            totalTokens: 12,
          },
        };
      });

      const events: Array<{ event: string; data: Record<string, unknown> }> = [];
      for await (const event of service.streamMessage('user-1', 'conv-1', { content: 'Hi' })) {
        events.push(event);
      }

      expect(events.some((e) => e.event === 'chunk')).toBe(true);
      expect(events.at(-1)?.event).toBe('done');
      expect(usageService.safeRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 200 }),
      );
    });

    it('does not consume successful quota when the stream fails', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation);
      prisma.message.findMany.mockResolvedValue([]);
      const { AiProviderRequestError } = await import('./interfaces/ai-completion.interface');
      aiCompletionService.completeStream.mockImplementation(async function* () {
        throw new AiProviderRequestError('AI provider request failed', 502);
        yield { type: 'delta', text: '' };
      });

      const events: Array<{ event: string }> = [];
      for await (const event of service.streamMessage('user-1', 'conv-1', { content: 'Hi' })) {
        events.push(event);
      }

      expect(events.at(-1)?.event).toBe('error');
      expect(usageService.safeRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 502 }),
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });
});
