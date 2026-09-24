import { Injectable, Logger } from '@nestjs/common';
import { APIUsageLog, HttpMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordUsageParams {
  userId?: string | null;
  requestId?: string;
  endpoint: string;
  method?: HttpMethod;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  statusCode: number;
  responseTimeMs: number;
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates metered request count for a user within a [startDate, endDate) interval.
   * Only successful responses (HTTP 2xx/3xx) consume subscription quota.
   * Failed provider/API attempts remain in APIUsageLog for analytics but do not burn quota.
   * Excludes unmetered/system logs (where userId is NULL).
   */
  async getUsageCount(userId: string, startDate: Date, endDate: Date): Promise<number> {
    if (!userId) {
      return 0;
    }

    const count = await this.prisma.aPIUsageLog.count({
      where: {
        userId,
        statusCode: {
          gte: 200,
          lt: 400,
        },
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    return count;
  }

  /**
   * Records an API request usage entry in the database.
   * Serves as the reusable contract for future AI/chat/search modules.
   */
  async recordUsage(params: RecordUsageParams): Promise<APIUsageLog> {
    return this.prisma.aPIUsageLog.create({
      data: {
        userId: params.userId ?? null,
        requestId: params.requestId ?? null,
        endpoint: params.endpoint,
        method: params.method ?? HttpMethod.POST,
        provider: params.provider ?? null,
        model: params.model ?? null,
        promptTokens: params.promptTokens ?? null,
        completionTokens: params.completionTokens ?? null,
        totalTokens:
          params.totalTokens ??
          (params.promptTokens != null || params.completionTokens != null
            ? (params.promptTokens ?? 0) + (params.completionTokens ?? 0)
            : null),
        statusCode: params.statusCode,
        responseTimeMs: params.responseTimeMs,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    });
  }

  /**
   * Best-effort usage logging. Failures are logged and never fail the primary request.
   */
  async safeRecordUsage(params: RecordUsageParams): Promise<void> {
    try {
      await this.recordUsage(params);
    } catch (error) {
      this.logger.warn(
        `Failed to record usage for ${params.endpoint}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
