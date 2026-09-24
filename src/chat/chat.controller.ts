import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SubscriptionUsageGuard } from '../subscriptions/guards/subscription-usage.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  ConversationDetailResponseDto,
  ConversationResponseDto,
  SendMessageResponseDto,
} from './dto/conversation-response.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a conversation' })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiBadRequestResponse({ description: 'Invalid provider or input' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.createConversation(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List current user conversations' })
  @ApiOkResponse({ description: 'Paginated conversation list' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.chatService.listConversations(user.id, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation with recent messages' })
  @ApiOkResponse({ type: ConversationDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailResponseDto> {
    return this.chatService.getConversation(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a conversation' })
  @ApiOkResponse({ type: ConversationResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.updateConversation(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a conversation' })
  @ApiOkResponse({ description: 'Conversation deleted' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.chatService.deleteConversation(user.id, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages in a conversation' })
  @ApiOkResponse({ description: 'Paginated messages' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<{
    items: MessageResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.chatService.listMessages(user.id, id, query.page, query.limit);
  }

  @Post(':id/messages')
  @UseGuards(SubscriptionUsageGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a chat message and receive an AI response',
    description:
      'Validates ownership and subscription quota, resolves an AI provider, persists user/assistant messages, and records usage.',
  })
  @ApiOkResponse({ type: SendMessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid provider/model/key configuration' })
  @ApiNotFoundResponse({ description: 'Conversation or provider not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiTooManyRequestsResponse({ description: 'Subscription usage limit exceeded' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
  @ApiOperation({
    summary: 'Send a chat message and stream the AI response (SSE)',
    description:
      'Server-Sent Events stream. Emits `chunk` events with partial text, then a final `done` event with persisted messages. Failed streams do not consume successful usage quota.',
  })
  @ApiOkResponse({
    description:
      'text/event-stream: event=chunk data={"text":"..."} ; event=done data={userMessage,assistantMessage} ; event=error data={message,statusCode}',
  })
  @ApiBadRequestResponse({ description: 'Invalid provider/model/key configuration' })
  @ApiNotFoundResponse({ description: 'Conversation or provider not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiTooManyRequestsResponse({ description: 'Subscription or HTTP rate limit exceeded' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
        const message = error instanceof Error ? error.message : 'Streaming chat request failed';
        res.write(`event: error\ndata: ${JSON.stringify({ message, statusCode: 500 })}\n\n`);
      }
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
