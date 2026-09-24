import { Injectable } from '@nestjs/common';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';

@Injectable()
export class HealthService {
  check(): HealthCheckResponseDto {
    return {
      status: 'ok',
      service: 'echogpt-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
