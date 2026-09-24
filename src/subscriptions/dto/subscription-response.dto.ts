import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { PlanResponseDto } from './plan-response.dto';

export class SubscriptionResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Unique subscription identifier (UUID)',
  })
  id!: string;

  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
    description: 'Current subscription status',
  })
  status!: SubscriptionStatus;

  @ApiProperty({
    type: () => PlanResponseDto,
    description: 'Associated subscription plan details',
  })
  plan!: PlanResponseDto;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Date subscription originally started',
  })
  startDate!: Date;

  @ApiPropertyOptional({
    example: null,
    description: 'Date subscription ends (if applicable)',
    nullable: true,
  })
  endDate!: Date | null;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Start date of the current active billing period',
  })
  currentPeriodStart!: Date;

  @ApiProperty({
    example: '2026-10-24T12:00:00.000Z',
    description: 'End date of the current active billing period',
  })
  currentPeriodEnd!: Date;

  @ApiPropertyOptional({
    example: null,
    description: 'Timestamp when cancellation was requested',
    nullable: true,
  })
  canceledAt!: Date | null;
}
