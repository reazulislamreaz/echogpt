import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok', description: 'Overall service status' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'echogpt-backend' })
  service!: string;

  @ApiProperty({
    example: 'up',
    description: 'PostgreSQL connectivity status',
  })
  database!: 'up' | 'down';

  @ApiProperty({ example: '2026-09-24T05:00:00.000Z' })
  timestamp!: string;
}
