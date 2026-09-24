import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminCreatePlanDto {
  @ApiProperty({
    example: 'ENTERPRISE',
    description: 'Unique plan name',
    maxLength: 50,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Plan name must be a string' })
  @IsNotEmpty({ message: 'Plan name is required' })
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    example: 'enterprise',
    description: 'Unique plan URL slug',
    maxLength: 50,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'Plan slug must be a string' })
  @IsNotEmpty({ message: 'Plan slug is required' })
  @MaxLength(50)
  slug!: string;

  @ApiPropertyOptional({
    example: 'Dedicated enterprise access with custom support',
    description: 'Plan description',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 99.99,
    description: 'Plan price per cycle',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number' })
  @Min(0, { message: 'Price cannot be negative' })
  price?: number;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Plan currency',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'monthly',
    description: 'Billing cycle cadence',
    default: 'monthly',
  })
  @IsOptional()
  @IsString()
  billingCycle?: string;

  @ApiPropertyOptional({
    example: 10000,
    description: 'Maximum requests allowed. Null indicates unlimited.',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'requestLimit must be an integer' })
  @Min(1, { message: 'requestLimit must be at least 1' })
  requestLimit?: number | null;

  @ApiPropertyOptional({
    example: { priorityQueue: true, customModels: true },
    description: 'Plan feature configuration JSON',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the plan is available for selection',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUpdatePlanDto {
  @ApiPropertyOptional({ example: 'Enterprise Pro' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 79.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a valid number' })
  @Min(0, { message: 'Price cannot be negative' })
  price?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'monthly' })
  @IsOptional()
  @IsString()
  billingCycle?: string;

  @ApiPropertyOptional({ example: 15000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'requestLimit must be an integer' })
  @Min(1, { message: 'requestLimit must be at least 1' })
  requestLimit?: number | null;

  @ApiPropertyOptional({ example: { webSearch: true } })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
