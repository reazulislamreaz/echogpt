import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';

export class AdminUpdateSubscriptionStatusDto {
  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.PAST_DUE,
    description: 'Updated lifecycle status for the subscription',
  })
  @IsEnum(SubscriptionStatus, {
    message: `status must be one of: ${Object.values(SubscriptionStatus).join(', ')}`,
  })
  @IsNotEmpty({ message: 'status is required' })
  status!: SubscriptionStatus;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination (1-indexed)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
