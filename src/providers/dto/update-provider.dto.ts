import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateProviderDto {
  @ApiPropertyOptional({ example: 'OpenAI', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'OpenAI GPT models', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://api.openai.com/v1',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  baseUrl?: string | null;

  @ApiPropertyOptional({
    example: 'sk-xxxxxxxxxxxxxxxx',
    description: 'Replaces the stored encrypted API key when provided',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
