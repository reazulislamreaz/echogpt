import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderResponseDto } from './provider-response.dto';

export class UserProviderResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  providerId!: string;

  @ApiProperty({ type: ProviderResponseDto })
  provider!: ProviderResponseDto;

  @ApiProperty({ example: true })
  isEnabled!: boolean;

  @ApiProperty({ example: false })
  isDefault!: boolean;

  @ApiProperty({ example: true })
  keyConfigured!: boolean;

  @ApiPropertyOptional({ example: '****abcd', nullable: true })
  keyPreview!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
