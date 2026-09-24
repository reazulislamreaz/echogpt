import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AdminUserActiveSubscriptionSummaryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 'Free' })
  planName!: string;

  @ApiProperty({ example: 'free' })
  planSlug!: string;

  @ApiPropertyOptional({
    example: 100,
    nullable: true,
    description: 'Null means unlimited requests for the plan',
  })
  requestLimit!: number | null;

  @ApiProperty()
  currentPeriodStart!: Date;

  @ApiProperty()
  currentPeriodEnd!: Date;
}

export class AdminUserDetailDto extends UserResponseDto {
  @ApiPropertyOptional({ nullable: true })
  deletedAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Active subscription summary when present',
    nullable: true,
    type: AdminUserActiveSubscriptionSummaryDto,
  })
  activeSubscription!: AdminUserActiveSubscriptionSummaryDto | null;
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

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
