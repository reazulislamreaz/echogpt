import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesModule } from '../roles/roles.module';
import { UsageModule } from '../usage/usage.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { SubscriptionUsageGuard } from './guards/subscription-usage.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [PrismaModule, UsageModule, RolesModule],
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [SubscriptionsService, SubscriptionUsageGuard],
  exports: [SubscriptionsService, SubscriptionUsageGuard],
})
export class SubscriptionsModule {}
