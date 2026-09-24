import { ApiProperty } from '@nestjs/swagger';

export class SearchResultItemDto {
  @ApiProperty({ example: 'NestJS Documentation' })
  title!: string;

  @ApiProperty({ example: 'https://docs.nestjs.com' })
  url!: string;

  @ApiProperty({ example: 'NestJS is a progressive Node.js framework...' })
  snippet!: string;
}

export class WebSearchResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'NestJS dependency injection' })
  query!: string;

  @ApiProperty({ example: 'serper' })
  provider!: string;

  @ApiProperty({ type: [SearchResultItemDto] })
  results!: SearchResultItemDto[];

  @ApiProperty({ example: 5 })
  resultCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class RecentSearchResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'NestJS dependency injection' })
  query!: string;

  @ApiProperty({ example: 'serper' })
  provider!: string;

  @ApiProperty({ example: 5 })
  resultCount!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class SearchSuggestionsResponseDto {
  @ApiProperty({
    type: [String],
    example: ['NestJS dependency injection', 'NestJS modules'],
  })
  suggestions!: string[];
}

export class PaginatedWebSearchHistoryDto {
  @ApiProperty({ type: [WebSearchResponseDto] })
  items!: WebSearchResponseDto[];

  @ApiProperty({
    example: { page: 1, limit: 20, total: 42, totalPages: 3 },
  })
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
