import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Application health check',
    description:
      'Database is critical (503 when down). Redis/SMTP are informational optional dependencies.',
  })
  @ApiOkResponse({
    description: 'Service healthy (database up)',
    type: HealthCheckResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Database unavailable',
    type: HealthCheckResponseDto,
  })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResponseDto> {
    const result = await this.healthService.check();
    if (result.database === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
