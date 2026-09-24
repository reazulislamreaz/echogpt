import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProviderHealthCheckResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  providerId!: string;

  @ApiProperty({ example: 'OPENAI' })
  slug!: string;

  @ApiProperty({ example: true })
  healthy!: boolean;

  @ApiProperty({
    example: 'ok',
    description: 'Safe status code: ok | misconfigured | unreachable | unauthorized | error',
  })
  status!: string;

  @ApiPropertyOptional({
    example: 'Provider responded successfully',
    description: 'Safe human-readable message (never includes API keys)',
  })
  message!: string;

  @ApiPropertyOptional({ example: 142, description: 'Latency in milliseconds when measured' })
  latencyMs!: number | null;

  @ApiProperty()
  checkedAt!: Date;
}
