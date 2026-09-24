import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsageModule } from '../usage/usage.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchCacheService } from './services/search-cache.service';
import { WebSearchProviderService } from './services/web-search-provider.service';

@Module({
  imports: [PrismaModule, SubscriptionsModule, UsageModule],
  controllers: [SearchController],
  providers: [SearchService, WebSearchProviderService, SearchCacheService],
  exports: [SearchService],
})
export class SearchModule {}
