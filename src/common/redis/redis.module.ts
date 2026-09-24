import { Global, Module } from '@nestjs/common';
import { FailOpenThrottlerStorage } from './fail-open-throttler.storage';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, FailOpenThrottlerStorage],
  exports: [RedisService, FailOpenThrottlerStorage],
})
export class RedisModule {}
