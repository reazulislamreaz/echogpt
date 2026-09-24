import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Application and database health check' })
  @ApiOkResponse({
    description: 'Service and database connectivity status',
    type: HealthCheckResponseDto,
  })
  check(): Promise<HealthCheckResponseDto> {
    return this.healthService.check();
  }
}
