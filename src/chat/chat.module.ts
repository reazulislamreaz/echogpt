import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageModule } from '../usage/usage.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiCompletionService } from './services/ai-completion.service';

@Module({
  imports: [PrismaModule, ProvidersModule, SubscriptionsModule, UsageModule],
  controllers: [ChatController],
  providers: [ChatService, AiCompletionService],
  exports: [ChatService],
})
export class ChatModule {}
