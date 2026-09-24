import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminDashboardStatsDto {
  @ApiProperty({ example: 120 })
  totalUsers!: number;

  @ApiProperty({ example: 110 })
  activeUsers!: number;

  @ApiProperty({ example: 95 })
  activeSubscriptions!: number;

  @ApiProperty({ example: 3 })
  totalProviders!: number;

  @ApiProperty({ example: 2 })
  activeProviders!: number;

  @ApiProperty({ example: 450 })
  totalConversations!: number;

  @ApiProperty({ example: 3200 })
  totalMessages!: number;

  @ApiProperty({ example: 210 })
  totalWebSearches!: number;

  @ApiProperty({ example: 5100 })
  totalApiRequests!: number;

  @ApiProperty({ example: 4800 })
  successfulApiRequests!: number;

  @ApiProperty({ example: 300 })
  failedApiRequests!: number;

  @ApiProperty({ example: 125000 })
  totalTokensUsed!: number;

  @ApiProperty({ example: '2026-09-24T10:00:00.000Z' })
  generatedAt!: string;
}

export class UsageByProviderDto {
  @ApiProperty({ example: 'OPENAI', nullable: true })
  provider!: string | null;

  @ApiProperty({ example: 1200 })
  requestCount!: number;

  @ApiProperty({ example: 45000, nullable: true })
  totalTokens!: number | null;
}

export class UsageByEndpointDto {
  @ApiProperty({ example: '/api/v1/web-search' })
  endpoint!: string;

  @ApiProperty({ example: 340 })
  requestCount!: number;
}

export class UsageByDayDto {
  @ApiProperty({ example: '2026-09-24' })
  date!: string;

  @ApiProperty({ example: 85 })
  requestCount!: number;
}

export class AdminUsageAnalyticsDto {
  @ApiProperty({ example: 5100 })
  totalRequests!: number;

  @ApiProperty({ example: 4800 })
  successfulRequests!: number;

  @ApiProperty({ example: 300 })
  failedRequests!: number;

  @ApiProperty({ example: 245.5, nullable: true })
  averageResponseTimeMs!: number | null;

  @ApiProperty({ example: 125000, nullable: true })
  totalTokens!: number | null;

  @ApiProperty({ type: [UsageByProviderDto] })
  byProvider!: UsageByProviderDto[];

  @ApiProperty({ type: [UsageByEndpointDto] })
  byEndpoint!: UsageByEndpointDto[];

  @ApiProperty({ type: [UsageByDayDto] })
  byDay!: UsageByDayDto[];

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z', nullable: true })
  periodStart!: string | null;

  @ApiPropertyOptional({ example: '2026-09-24T23:59:59.000Z', nullable: true })
  periodEnd!: string | null;
}

export class AdminUsageLogItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  requestId!: string | null;

  @ApiProperty()
  endpoint!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty({ nullable: true })
  provider!: string | null;

  @ApiProperty({ nullable: true })
  model!: string | null;

  @ApiProperty({ nullable: true })
  promptTokens!: number | null;

  @ApiProperty({ nullable: true })
  completionTokens!: number | null;

  @ApiProperty({ nullable: true })
  totalTokens!: number | null;

  @ApiProperty()
  statusCode!: number;

  @ApiProperty()
  responseTimeMs!: number;

  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true })
  errorMessage!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedAdminUsageLogsDto {
  @ApiProperty({ type: [AdminUsageLogItemDto] })
  items!: AdminUsageLogItemDto[];

  @ApiProperty({
    example: { page: 1, limit: 20, total: 100, totalPages: 5 },
  })
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class AdminSystemHealthDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'echogpt-backend' })
  service!: string;

  @ApiProperty({ example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({
    example: {
      total: 3,
      active: 2,
      withConfiguredKey: 2,
      defaultProvider: 'OPENAI',
    },
  })
  providers!: {
    total: number;
    active: number;
    withConfiguredKey: number;
    defaultProvider: string | null;
  };

  @ApiProperty({ example: '2026-09-24T10:00:00.000Z' })
  timestamp!: string;
}
