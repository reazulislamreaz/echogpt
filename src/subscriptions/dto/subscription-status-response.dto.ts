import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';

export class StatusPlanSummaryDto {
  @ApiProperty({
    example: 'd9e0f6b4-e78a-2c1f-9384-72910ab38472',
    description: 'Plan identifier (UUID)',
  })
  id!: string;

  @ApiProperty({
    example: 'Premium',
    description: 'Plan name',
  })
  name!: string;

  @ApiProperty({
    example: 'premium',
    description: 'Plan slug',
  })
  slug!: string;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Request limit for the plan. Null indicates an unlimited tier.',
    nullable: true,
  })
  requestLimit!: number | null;
}

export class SubscriptionStatusResponseDto {
  @ApiProperty({
    type: () => StatusPlanSummaryDto,
    description: 'Current subscription plan summary',
  })
  plan!: StatusPlanSummaryDto;

  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
    description: 'Current subscription lifecycle status',
  })
  status!: SubscriptionStatus;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Start of the current billing cycle interval',
  })
  currentPeriodStart!: Date;

  @ApiProperty({
    example: '2026-10-24T12:00:00.000Z',
    description: 'End of the current billing cycle interval',
  })
  currentPeriodEnd!: Date;

  @ApiProperty({
    example: 123,
    description: 'Total metered requests consumed within the current billing period',
  })
  usage!: number;

  @ApiPropertyOptional({
    example: 877,
    description:
      'Remaining requests available before reaching the plan limit. Null for unlimited plans.',
    nullable: true,
  })
  remainingRequests!: number | null;

  @ApiProperty({
    example: false,
    description: 'Indicates whether the plan has an unlimited request limit',
  })
  isUnlimited!: boolean;

  @ApiProperty({
    example: 12.3,
    description: 'Usage percentage of the plan limit (0-100%). Returns 0 for unlimited plans.',
  })
  usagePercentage!: number;

  @ApiPropertyOptional({
    example: null,
    description: 'Timestamp when cancellation was initiated, if scheduled',
    nullable: true,
  })
  canceledAt!: Date | null;
}
