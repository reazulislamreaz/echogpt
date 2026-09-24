import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'echogpt-backend' })
  service!: string;

  @ApiProperty({ example: '2026-09-24T05:00:00.000Z' })
  timestamp!: string;
}
