import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  AdminDashboardStatsDto,
  AdminSystemHealthDto,
  AdminUsageAnalyticsDto,
  AdminUsageLogItemDto,
  PaginatedAdminUsageLogsDto,
} from './dto/admin-dashboard.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStatsDto> {
    const [
      totalUsers,
      activeUsers,
      activeSubscriptions,
      totalProviders,
      activeProviders,
      totalConversations,
      totalMessages,
      totalWebSearches,
      totalApiRequests,
      successfulApiRequests,
      failedApiRequests,
      tokenAggregate,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.aIProvider.count(),
      this.prisma.aIProvider.count({ where: { isActive: true } }),
      this.prisma.conversation.count({ where: { deletedAt: null } }),
      this.prisma.message.count(),
      this.prisma.webSearch.count(),
      this.prisma.aPIUsageLog.count(),
      this.prisma.aPIUsageLog.count({ where: { statusCode: { gte: 200, lt: 400 } } }),
      this.prisma.aPIUsageLog.count({ where: { statusCode: { gte: 400 } } }),
      this.prisma.aPIUsageLog.aggregate({
        _sum: { totalTokens: true },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      activeSubscriptions,
      totalProviders,
      activeProviders,
      totalConversations,
      totalMessages,
      totalWebSearches,
      totalApiRequests,
      successfulApiRequests,
      failedApiRequests,
      totalTokensUsed: tokenAggregate._sum.totalTokens ?? 0,
      generatedAt: new Date().toISOString(),
    };
  }

  async getUsageAnalytics(from?: string, to?: string): Promise<AdminUsageAnalyticsDto> {
    const createdAt = this.buildDateFilter(from, to);
    const where: Prisma.APIUsageLogWhereInput = createdAt ? { createdAt } : {};

    const [totalRequests, successfulRequests, failedRequests, aggregates, byProvider, byEndpoint] =
      await Promise.all([
        this.prisma.aPIUsageLog.count({ where }),
        this.prisma.aPIUsageLog.count({
          where: { ...where, statusCode: { gte: 200, lt: 400 } },
        }),
        this.prisma.aPIUsageLog.count({
          where: { ...where, statusCode: { gte: 400 } },
        }),
        this.prisma.aPIUsageLog.aggregate({
          where,
          _avg: { responseTimeMs: true },
          _sum: { totalTokens: true },
        }),
        this.prisma.aPIUsageLog.groupBy({
          by: ['provider'],
          where,
          _count: { _all: true },
          _sum: { totalTokens: true },
          orderBy: { _count: { provider: 'desc' } },
          take: 20,
        }),
        this.prisma.aPIUsageLog.groupBy({
          by: ['endpoint'],
          where,
          _count: { _all: true },
          orderBy: { _count: { endpoint: 'desc' } },
          take: 20,
        }),
      ]);

    const byDay = await this.getUsageByDay(where);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTimeMs:
        aggregates._avg.responseTimeMs != null
          ? Math.round(aggregates._avg.responseTimeMs * 100) / 100
          : null,
      totalTokens: aggregates._sum.totalTokens ?? null,
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        requestCount: row._count._all,
        totalTokens: row._sum.totalTokens,
      })),
      byEndpoint: byEndpoint.map((row) => ({
        endpoint: row.endpoint,
        requestCount: row._count._all,
      })),
      byDay,
      periodStart: from ?? null,
      periodEnd: to ?? null,
    };
  }

  async getUsageLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    provider?: string;
    statusCode?: number;
    from?: string;
    to?: string;
  }): Promise<PaginatedAdminUsageLogsDto> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.APIUsageLogWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.statusCode != null ? { statusCode: params.statusCode } : {}),
      ...(this.buildDateFilter(params.from, params.to)
        ? { createdAt: this.buildDateFilter(params.from, params.to) }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.aPIUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          requestId: true,
          endpoint: true,
          method: true,
          provider: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          statusCode: true,
          responseTimeMs: true,
          ipAddress: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      this.prisma.aPIUsageLog.count({ where }),
    ]);

    const items: AdminUsageLogItemDto[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      requestId: row.requestId,
      endpoint: row.endpoint,
      method: row.method,
      provider: row.provider,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      statusCode: row.statusCode,
      responseTimeMs: row.responseTimeMs,
      ipAddress: row.ipAddress,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getSystemHealth(): Promise<AdminSystemHealthDto> {
    const databaseUp = await this.prisma.isHealthy();
    const [total, active, withKey, defaultProvider] = await Promise.all([
      this.prisma.aIProvider.count(),
      this.prisma.aIProvider.count({ where: { isActive: true } }),
      this.prisma.aIProvider.count({ where: { encryptedApiKey: { not: null } } }),
      this.prisma.aIProvider.findFirst({
        where: { isDefault: true },
        select: { slug: true },
      }),
    ]);

    return {
      status: databaseUp ? 'ok' : 'degraded',
      service: 'echogpt-backend',
      database: databaseUp ? 'up' : 'down',
      providers: {
        total,
        active,
        withConfiguredKey: withKey,
        defaultProvider: defaultProvider?.slug ?? null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async updateUserStatus(userId: string, isActive: boolean): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: userId },
        data: { isActive },
        include: { role: true },
      });

      if (!isActive) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return next;
    });

    return this.usersService.toSafeUser(updated);
  }

  private buildDateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }

    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lt: new Date(to) } : {}),
    };
  }

  private async getUsageByDay(
    where: Prisma.APIUsageLogWhereInput,
  ): Promise<Array<{ date: string; requestCount: number }>> {
    const from =
      where.createdAt && typeof where.createdAt === 'object' && 'gte' in where.createdAt
        ? (where.createdAt.gte as Date | undefined)
        : undefined;
    const to =
      where.createdAt && typeof where.createdAt === 'object' && 'lt' in where.createdAt
        ? (where.createdAt.lt as Date | undefined)
        : undefined;

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; request_count: bigint }>>`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::bigint AS request_count
      FROM api_usage_logs
      WHERE (${from}::timestamptz IS NULL OR created_at >= ${from})
        AND (${to}::timestamptz IS NULL OR created_at < ${to})
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 30
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      requestCount: Number(row.request_count),
    }));
  }
}
