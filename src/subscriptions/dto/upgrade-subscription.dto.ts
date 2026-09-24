import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({
    example: 'premium',
    description: 'Unique slug of the target upgrade plan',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'planSlug must be a string' })
  @IsNotEmpty({ message: 'planSlug is required' })
  @MaxLength(50, { message: 'planSlug cannot exceed 50 characters' })
  planSlug!: string;
}
