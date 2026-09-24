import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CommonModule } from './common/common.module';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { RolesModule } from './roles/roles.module';
import { SearchModule } from './search/search.module';
import { SessionsModule } from './sessions/sessions.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    CommonModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SessionsModule,
    SubscriptionsModule,
    ProvidersModule,
    ChatModule,
    SearchModule,
    UsageModule,
    AdminModule,
  ],
})
export class AppModule {}
