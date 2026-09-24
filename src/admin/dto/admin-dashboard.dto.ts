import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminDashboardUsersStatsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  inactive!: number;

  @ApiProperty()
  verified!: number;

  @ApiProperty()
  unverified!: number;

  @ApiProperty({ description: 'Users registered in the last 7 days' })
  recentlyRegistered!: number;
}

export class AdminDashboardSubscriptionsStatsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  free!: number;

  @ApiProperty()
  premium!: number;

  @ApiProperty()
  canceled!: number;

  @ApiProperty()
  expired!: number;

  @ApiProperty()
  pastDue!: number;

  @ApiProperty()
  trialing!: number;
}

export class AdminDashboardProvidersStatsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  inactive!: number;

  @ApiProperty({ nullable: true })
  defaultProvider!: string | null;
}

export class AdminDashboardUsageStatsDto {
  @ApiProperty()
  totalRequests!: number;

  @ApiProperty()
  successfulRequests!: number;

  @ApiProperty()
  failedRequests!: number;

  @ApiProperty()
  totalTokensUsed!: number;

  @ApiProperty({ description: 'API requests created in the last 30 days' })
  last30DaysRequests!: number;
}

export class AdminDashboardChatStatsDto {
  @ApiProperty()
  totalConversations!: number;

  @ApiProperty()
  totalMessages!: number;
}

export class AdminDashboardSearchStatsDto {
  @ApiProperty()
  totalSearches!: number;
}

export class AdminDashboardSystemStatsDto {
  @ApiProperty({ example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({ example: 12345.6, description: 'Process uptime in seconds' })
  uptimeSeconds!: number;
}

export class AdminDashboardStatsDto {
  @ApiProperty({ type: AdminDashboardUsersStatsDto })
  users!: AdminDashboardUsersStatsDto;

  @ApiProperty({ type: AdminDashboardSubscriptionsStatsDto })
  subscriptions!: AdminDashboardSubscriptionsStatsDto;

  @ApiProperty({ type: AdminDashboardProvidersStatsDto })
  providers!: AdminDashboardProvidersStatsDto;

  @ApiProperty({ type: AdminDashboardUsageStatsDto })
  usage!: AdminDashboardUsageStatsDto;

  @ApiProperty({ type: AdminDashboardChatStatsDto })
  chat!: AdminDashboardChatStatsDto;

  @ApiProperty({ type: AdminDashboardSearchStatsDto })
  webSearch!: AdminDashboardSearchStatsDto;

  @ApiProperty({ type: AdminDashboardSystemStatsDto })
  system!: AdminDashboardSystemStatsDto;

  @ApiProperty()
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

export class UsageByStatusDto {
  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 120 })
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

  @ApiProperty({ example: 80000, nullable: true })
  promptTokens!: number | null;

  @ApiProperty({ example: 45000, nullable: true })
  completionTokens!: number | null;

  @ApiProperty({ type: [UsageByProviderDto] })
  byProvider!: UsageByProviderDto[];

  @ApiProperty({ type: [UsageByEndpointDto] })
  byEndpoint!: UsageByEndpointDto[];

  @ApiProperty({ type: [UsageByStatusDto] })
  byStatusCode!: UsageByStatusDto[];

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

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({
    example: { status: 'connected' },
  })
  database!: {
    status: 'connected' | 'disconnected';
  };

  @ApiProperty({ example: 12345.6 })
  uptimeSeconds!: number;

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
