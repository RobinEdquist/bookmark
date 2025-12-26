import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SeriesItemDto {
  @ApiProperty({
    example: 'abc123-def456',
    description: 'Unique identifier for the series',
  })
  id!: string;

  @ApiProperty({
    example: 'The Lord of the Rings',
    description: 'Name of the series',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'J.R.R. Tolkien',
    description: 'Primary author of the series',
  })
  author?: string | null;

  @ApiProperty({ example: 3, description: 'Number of books in this series' })
  bookCount!: number;

  @ApiPropertyOptional({
    example: '/covers/series/abc123.jpg',
    description: 'Cover image URL',
  })
  coverUrl?: string | null;

  @ApiPropertyOptional({
    example: '2024-01-15T12:00:00.000Z',
    description: 'When the series was last updated',
  })
  updatedAt?: string | null;
}

export class SeriesListResponseDto {
  @ApiProperty({ type: [SeriesItemDto], description: 'List of series' })
  items!: SeriesItemDto[];

  @ApiProperty({ example: 25, description: 'Total count of series' })
  total!: number;

  @ApiProperty({ example: 50, description: 'Number of items per page' })
  limit!: number;

  @ApiProperty({ example: 0, description: 'Number of items skipped' })
  offset!: number;
}
