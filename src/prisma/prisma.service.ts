import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const nodeEnv = this.configService.get<string>('app.nodeEnv', 'development');

    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (nodeEnv === 'production') {
        throw error;
      }

      // During early scaffolding the database may not be running yet.
      this.logger.warn(`Prisma connection deferred (${nodeEnv}): ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
