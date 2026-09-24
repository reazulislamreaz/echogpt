import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProviderResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'OpenAI' })
  name!: string;

  @ApiProperty({ example: 'OPENAI' })
  slug!: string;

  @ApiPropertyOptional({ example: 'OpenAI GPT models', nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ example: 'https://api.openai.com/v1', nullable: true })
  baseUrl!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: true })
  isDefault!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether an encrypted API key is configured (never the raw key)',
  })
  keyConfigured!: boolean;

  @ApiPropertyOptional({
    example: '****abcd',
    nullable: true,
    description: 'Masked key preview when available',
  })
  keyPreview!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
