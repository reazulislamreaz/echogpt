import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { SubscriptionResponseDto } from '../../subscriptions/dto/subscription-response.dto';

export class AdminSubscriptionUserSummaryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'Ada', nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ example: 'Lovelace', nullable: true })
  lastName!: string | null;
}

export class AdminSubscriptionDetailDto extends SubscriptionResponseDto {
  @ApiProperty({ type: AdminSubscriptionUserSummaryDto })
  user!: AdminSubscriptionUserSummaryDto;
}

export class PaginatedAdminSubscriptionsDto {
  @ApiProperty({ type: [AdminSubscriptionDetailDto] })
  items!: AdminSubscriptionDetailDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class AdminUserSubscriptionPlanSummaryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'Free' })
  name!: string;

  @ApiProperty({ example: 'free' })
  slug!: string;

  @ApiPropertyOptional({
    example: 50,
    nullable: true,
    description: 'Null means unlimited requests',
  })
  requestLimit!: number | null;

  @ApiProperty({ example: 0, description: 'Numeric plan price' })
  price!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'monthly' })
  billingCycle!: string;
}

export class AdminUserSubscriptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({ type: AdminUserSubscriptionPlanSummaryDto })
  plan!: AdminUserSubscriptionPlanSummaryDto;

  @ApiProperty()
  currentPeriodStart!: Date;

  @ApiProperty()
  currentPeriodEnd!: Date;

  @ApiPropertyOptional({ nullable: true })
  canceledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  endDate!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
