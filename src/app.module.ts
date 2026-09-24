import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CommonModule } from './common/common.module';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { FailOpenThrottlerStorage } from './common/redis/fail-open-throttler.storage';
import { RedisModule } from './common/redis/redis.module';
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
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, FailOpenThrottlerStorage],
      useFactory: (configService: ConfigService, storage: FailOpenThrottlerStorage) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('app.throttle.ttlMs', 60000),
            limit: configService.get<number>('app.throttle.limit', 100),
          },
        ],
        storage,
      }),
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
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
