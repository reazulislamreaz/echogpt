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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
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
@ApiBearerAuth()
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
      'Validates subscription quota, executes the configured search provider, persists history, and records usage.',
  })
  @ApiCreatedResponse({ type: WebSearchResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid search query' })
  @ApiTooManyRequestsResponse({ description: 'Subscription usage limit exceeded' })
  @ApiServiceUnavailableResponse({ description: 'Search provider not configured' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
  @ApiOperation({ summary: 'List current user search history' })
  @ApiOkResponse({ type: PaginatedWebSearchHistoryDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedWebSearchHistoryDto> {
    return this.searchService.listHistory(user.id, query.page, query.limit);
  }

  @Get('recent')
  @ApiOperation({ summary: 'List recent searches for the current user' })
  @ApiOkResponse({ type: [RecentSearchResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchSuggestionsQueryDto,
  ): Promise<SearchSuggestionsResponseDto> {
    return this.searchService.getSuggestions(user.id, query.q, query.limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single search history record' })
  @ApiOkResponse({ type: WebSearchResponseDto })
  @ApiNotFoundResponse({ description: 'Search record not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WebSearchResponseDto> {
    return this.searchService.getOne(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a search history record' })
  @ApiOkResponse({ description: 'Search record deleted' })
  @ApiNotFoundResponse({ description: 'Search record not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.searchService.deleteOne(user.id, id);
  }
}
