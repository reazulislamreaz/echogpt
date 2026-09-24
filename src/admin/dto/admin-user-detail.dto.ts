import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AdminUserDetailDto extends UserResponseDto {
  @ApiPropertyOptional({ nullable: true })
  deletedAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Active subscription summary when present',
    nullable: true,
  })
  activeSubscription!: {
    id: string;
    status: string;
    planName: string;
    planSlug: string;
    requestLimit: number | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
}

export class AdminUserUsageSummaryDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ example: 42 })
  totalRequests!: number;

  @ApiProperty({ example: 40 })
  successfulRequests!: number;

  @ApiProperty({ example: 2 })
  failedRequests!: number;

  @ApiProperty({ example: 12000, nullable: true })
  totalTokens!: number | null;

  @ApiProperty({ example: 8000, nullable: true })
  promptTokens!: number | null;

  @ApiProperty({ example: 4000, nullable: true })
  completionTokens!: number | null;

  @ApiProperty({ example: 210.5, nullable: true })
  averageResponseTimeMs!: number | null;

  @ApiPropertyOptional({ nullable: true })
  currentPeriodStart!: string | null;

  @ApiPropertyOptional({ nullable: true })
  currentPeriodEnd!: string | null;

  @ApiPropertyOptional({
    description: 'Requests in the active subscription billing period',
    nullable: true,
  })
  currentPeriodRequests!: number | null;

  @ApiPropertyOptional({
    description: 'Remaining requests in period; null when unlimited or no active subscription',
    nullable: true,
  })
  remainingRequests!: number | null;
}

export class PaginatedAdminUsersDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

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
