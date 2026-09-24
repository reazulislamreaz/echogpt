import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Current page number (1-indexed)' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Page size' })
  limit!: number;

  @ApiProperty({ example: 42, description: 'Total matching records' })
  total!: number;

  @ApiProperty({ example: 3, description: 'Total number of pages' })
  totalPages!: number;
}
