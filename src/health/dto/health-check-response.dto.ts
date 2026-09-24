import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok', description: 'Overall service status (database-critical)' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'echogpt-backend' })
  service!: string;

  @ApiProperty({
    example: 'up',
    description: 'PostgreSQL connectivity status (critical dependency)',
  })
  database!: 'up' | 'down';

  @ApiPropertyOptional({
    example: 'disabled',
    description: 'Optional Redis status — unavailable Redis does not degrade overall status',
  })
  redis?: 'up' | 'down' | 'disabled';

  @ApiPropertyOptional({
    example: 'configured',
    description: 'Optional SMTP configuration status — unavailable SMTP does not degrade overall status',
  })
  smtp?: 'configured' | 'unconfigured';

  @ApiProperty({ example: '2026-09-24T05:00:00.000Z' })
  timestamp!: string;
}
