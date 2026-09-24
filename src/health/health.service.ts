import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async check(): Promise<HealthCheckResponseDto> {
    const databaseUp = await this.prisma.isHealthy();
    const redisHost = this.configService.get<string>('app.redis.host')?.trim();
    const smtpHost = this.configService.get<string>('app.smtp.host')?.trim();

    let redis: 'up' | 'down' | 'disabled' = 'disabled';
    if (redisHost) {
      redis = this.redis.isAvailable() ? 'up' : 'down';
    }

    return {
      // Overall status reflects critical DB only — optional deps never flip this alone.
      status: databaseUp ? 'ok' : 'degraded',
      service: 'echogpt-backend',
      database: databaseUp ? 'up' : 'down',
      redis,
      smtp: smtpHost ? 'configured' : 'unconfigured',
      timestamp: new Date().toISOString(),
    };
  }
}
