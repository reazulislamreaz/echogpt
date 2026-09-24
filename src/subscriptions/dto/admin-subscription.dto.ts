import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

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
