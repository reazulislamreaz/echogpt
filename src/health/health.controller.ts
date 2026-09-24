import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Application health check',
    description:
      'Reports application health. Database is critical (HTTP 503 when down). Redis and SMTP are informational optional dependencies and do not fail the overall status when unavailable.',
  })
  @ApiOkResponse({
    description: 'Service healthy (database up)',
    type: HealthCheckResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Database unavailable — body still uses the health check schema',
    type: HealthCheckResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'HTTP rate limit exceeded',
    type: ApiErrorResponseDto,
  })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResponseDto> {
    const result = await this.healthService.check();
    if (result.database === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
