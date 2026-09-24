import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 401, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({
    example: 'Unauthorized',
    description: 'Human-readable error message or validation message list',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized', description: 'Error name / category' })
  error!: string;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'ISO timestamp when the error was produced',
  })
  timestamp!: string;

  @ApiProperty({
    example: '/api/v1/auth/login',
    description: 'Request path that produced the error',
  })
  path!: string;

  @ApiPropertyOptional({
    example: '9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
    description: 'Optional request correlation id when available',
  })
  requestId?: string;
}
