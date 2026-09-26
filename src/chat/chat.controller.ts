import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApiAuthErrors,
  ApiStandardBadGateway,
  ApiStandardBadRequest,
  ApiStandardForbidden,
  ApiStandardGatewayTimeout,
  ApiStandardNotFound,
  ApiStandardUnprocessable,
} from '../common/swagger/api-error-responses';
import { SubscriptionUsageGuard } from '../subscriptions/guards/subscription-usage.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  ConversationDetailResponseDto,
  ConversationResponseDto,
  SendMessageResponseDto,
} from './dto/conversation-response.dto';
import {
  ConversationDeletedResponseDto,
  PaginatedConversationsDto,
  PaginatedMessagesDto,
} from './dto/paginated-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  StreamChunkEventDto,
  StreamDoneEventDto,
  StreamErrorEventDto,
} from './dto/stream-events.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@ApiTags('chat')
@ApiBearerAuth('bearer')
@ApiExtraModels(StreamChunkEventDto, StreamDoneEventDto, StreamErrorEventDto)
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a conversation',
    description: 'Creates a new conversation owned by the authenticated user.',
  })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  @ApiStandardUnprocessable()
  @ApiAuthErrors()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.createConversation(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List current user conversations',
    description:
      'Returns a paginated list of non-deleted conversations for the authenticated user.',
  })
  @ApiOkResponse({ type: PaginatedConversationsDto })
  @ApiStandardUnprocessable()
  @ApiAuthErrors()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedConversationsDto> {
    return this.chatService.listConversations(user.id, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a conversation with recent messages',
    description: 'Returns conversation metadata and up to 200 recent messages.',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  @ApiStandardBadRequest('Invalid conversation UUID')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiAuthErrors()
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailResponseDto> {
    return this.chatService.getConversation(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a conversation',
    description: 'Updates title, default provider, or model for an owned conversation.',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({ type: ConversationResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid conversation UUID or inactive provider')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiAuthErrors()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.updateConversation(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a conversation',
    description:
      'Marks the conversation as deleted. Messages remain for audit but the conversation is hidden.',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({ type: ConversationDeletedResponseDto })
  @ApiStandardBadRequest('Invalid conversation UUID')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiAuthErrors()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDeletedResponseDto> {
    return this.chatService.deleteConversation(user.id, id);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'List messages in a conversation',
    description: 'Returns a paginated message history for an owned conversation.',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({ type: PaginatedMessagesDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid conversation UUID')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiAuthErrors()
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedMessagesDto> {
    return this.chatService.listMessages(user.id, id, query.page, query.limit);
  }

  @Post(':id/messages')
  @UseGuards(SubscriptionUsageGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a chat message and receive an AI response',
    description:
      'Validates ownership and subscription quota, resolves an AI provider, persists user/assistant messages, and records successful usage only.',
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({ type: SendMessageResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid UUID, inactive provider, or invalid request')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiStandardBadGateway('AI provider request failed')
  @ApiStandardGatewayTimeout('AI provider request timed out')
  @ApiAuthErrors()
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ): Promise<SendMessageResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.chatService.sendMessage(user.id, id, dto, {
      ipAddress,
      userAgent,
    });
  }

  @Post(':id/messages/stream')
  @UseGuards(SubscriptionUsageGuard)
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Send a chat message and stream the AI response (SSE)',
    description: [
      'Streams the AI-generated response using Server-Sent Events.',
      '',
      'Event types:',
      '- `chunk` → `{ "text": "..." }` partial assistant deltas',
      '- `done` → `{ "userMessage": {...}, "assistantMessage": {...} }` after successful persistence',
      '- `error` → `{ "message": "...", "statusCode": 502 }` on provider/stream failure',
      '',
      'Failed streams do not consume successful subscription quota. Client disconnect aborts the upstream provider stream.',
      'Pre-stream failures (auth, ownership, quota, validation) may also be emitted as an SSE `error` event after headers are sent.',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', description: 'Conversation UUID' })
  @ApiOkResponse({
    description:
      'SSE stream (`text/event-stream`). See operation description for `chunk` / `done` / `error` payloads.',
    schema: {
      type: 'string',
      example:
        'event: chunk\ndata: {"text":"Hello "}\n\nevent: done\ndata: {"userMessage":{"id":"..."},"assistantMessage":{"id":"..."}}\n\n',
    },
  })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid UUID, inactive provider, or invalid request')
  @ApiStandardNotFound()
  @ApiStandardForbidden('Ownership violation')
  @ApiStandardBadGateway('AI provider request failed')
  @ApiStandardGatewayTimeout('AI provider request timed out')
  @ApiAuthErrors()
  async streamMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];
    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.once('close', onClose);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      for await (const event of this.chatService.streamMessage(user.id, id, dto, {
        ipAddress,
        userAgent,
        signal: abort.signal,
      })) {
        if (abort.signal.aborted || res.writableEnded) {
          break;
        }
        res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (error) {
      if (!res.writableEnded && !abort.signal.aborted) {
        const { message, statusCode } = this.normalizeStreamError(error);
        res.write(`event: error\ndata: ${JSON.stringify({ message, statusCode })}\n\n`);
      }
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private normalizeStreamError(error: unknown): { message: string; statusCode: number } {
    if (error instanceof HttpException) {
      const statusCode = error.getStatus();
      const response = error.getResponse();
      if (typeof response === 'string') {
        return { message: response, statusCode };
      }
      const message = (response as { message?: string | string[] }).message ?? error.message;
      return {
        message: Array.isArray(message) ? message.join('; ') : message,
        statusCode,
      };
    }

    return {
      message: 'Streaming chat request failed',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
