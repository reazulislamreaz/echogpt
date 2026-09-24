import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlanResponseDto {
  @ApiProperty({
    example: 'd9e0f6b4-e78a-2c1f-9384-72910ab38472',
    description: 'Unique plan identifier (UUID)',
  })
  id!: string;

  @ApiProperty({
    example: 'FREE',
    description: 'Display name of the subscription plan',
  })
  name!: string;

  @ApiProperty({
    example: 'free',
    description: 'URL-friendly unique plan slug',
  })
  slug!: string;

  @ApiPropertyOptional({
    example: 'Standard free tier with essential features',
    description: 'Detailed plan description',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    example: '0.00',
    description: 'Plan price per billing cycle',
  })
  price!: string;

  @ApiProperty({
    example: 'USD',
    description: 'Three-letter currency code (ISO 4217)',
  })
  currency!: string;

  @ApiProperty({
    example: 'monthly',
    description: 'Plan billing cycle cadence (monthly, yearly)',
  })
  billingCycle!: string;

  @ApiPropertyOptional({
    example: 50,
    description:
      'Maximum number of metered requests allowed per billing period. Null indicates unlimited.',
    nullable: true,
  })
  requestLimit!: number | null;

  @ApiPropertyOptional({
    example: { maxRequestsPerDay: 50, webSearchEnabled: true },
    description: 'Plan feature configuration JSON',
    nullable: true,
  })
  features!: Record<string, unknown> | null;

  @ApiProperty({
    example: true,
    description: 'Indicates whether the plan is active for enrollment',
  })
  isActive!: boolean;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Plan creation timestamp',
  })
  createdAt!: Date;
}
