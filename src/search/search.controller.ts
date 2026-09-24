import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApiStandardBadRequest,
  ApiStandardForbidden,
  ApiStandardNotFound,
  ApiStandardServiceUnavailable,
  ApiStandardTooManyRequests,
  ApiStandardUnauthorized,
} from '../common/swagger/api-error-responses';
import { SubscriptionUsageGuard } from '../subscriptions/guards/subscription-usage.guard';
import { CreateWebSearchDto } from './dto/create-web-search.dto';
import { RecentSearchesQueryDto } from './dto/recent-searches-query.dto';
import { SearchSuggestionsQueryDto } from './dto/search-suggestions-query.dto';
import {
  PaginatedWebSearchHistoryDto,
  RecentSearchResponseDto,
  SearchSuggestionsResponseDto,
  WebSearchResponseDto,
} from './dto/web-search-response.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('web-search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @UseGuards(SubscriptionUsageGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Perform a web search',
    description:
      'Validates subscription quota, executes the configured search provider, persists history, and records successful usage only. Caching (when Redis is available) is an internal optimization and is not exposed to clients.',
  })
  @ApiCreatedResponse({ type: WebSearchResponseDto })
  @ApiStandardBadRequest('Invalid search query')
  @ApiStandardTooManyRequests('Subscription usage limit or HTTP rate limit exceeded')
  @ApiStandardServiceUnavailable('Search provider not configured')
  @ApiStandardUnauthorized()
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWebSearchDto,
    @Req() req: Request,
  ): Promise<WebSearchResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.searchService.search(user.id, dto, { ipAddress, userAgent });
  }

  @Get('history')
  @ApiOperation({
    summary: 'List current user search history',
    description: 'Returns a paginated list of the authenticated user web search history.',
  })
  @ApiOkResponse({ type: PaginatedWebSearchHistoryDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedWebSearchHistoryDto> {
    return this.searchService.listHistory(user.id, query.page, query.limit);
  }

  @Get('recent')
  @ApiOperation({
    summary: 'List recent searches for the current user',
    description: 'Returns the most recent search records for the authenticated user.',
  })
  @ApiOkResponse({ type: [RecentSearchResponseDto] })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async recent(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecentSearchesQueryDto,
  ): Promise<RecentSearchResponseDto[]> {
    return this.searchService.listRecent(user.id, query.limit ?? 10);
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Get search suggestions from the current user history',
    description:
      'Returns distinct previous queries for the authenticated user, optionally filtered by a prefix/term.',
  })
  @ApiOkResponse({ type: SearchSuggestionsResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchSuggestionsQueryDto,
  ): Promise<SearchSuggestionsResponseDto> {
    return this.searchService.getSuggestions(user.id, query.q, query.limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single search history record',
    description: 'Returns one owned web search history record by ID.',
  })
  @ApiParam({ name: 'id', description: 'Web search record UUID' })
  @ApiOkResponse({ type: WebSearchResponseDto })
  @ApiStandardNotFound('Search record not found')
  @ApiStandardForbidden('Ownership violation')
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WebSearchResponseDto> {
    return this.searchService.getOne(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a search history record',
    description: 'Deletes an owned web search history record.',
  })
  @ApiParam({ name: 'id', description: 'Web search record UUID' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardNotFound('Search record not found')
  @ApiStandardForbidden('Ownership violation')
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    return this.searchService.deleteOne(user.id, id);
  }
}
