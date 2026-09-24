import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetProviderActiveDto {
  @ApiProperty({
    example: true,
    description: 'Whether the provider is available for selection',
  })
  @IsBoolean()
  isActive!: boolean;
}
