import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWebSearchDto {
  @ApiProperty({
    example: 'NestJS dependency injection',
    description: 'Search query text',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Search query must not be empty' })
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Maximum number of results to return (1–20)',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
