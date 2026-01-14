import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrFinderStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether Goodreads Finder is configured via GR_FINDER_URL',
  })
  configured!: boolean;
}

export class GrFinderSearchResultDto {
  @ApiProperty({ example: "The Hitchhiker's Guide to the Galaxy" })
  title!: string;

  @ApiProperty({ example: 'Douglas Adams' })
  author!: string;

  @ApiProperty({ example: '386162' })
  goodreads_id!: string;

  @ApiPropertyOptional({
    example: 'https://images.gr-assets.com/books/1531891848l/386162.jpg',
  })
  cover_url!: string | null;

  @ApiPropertyOptional({ example: '4.22' })
  avg_rating!: string | null;

  @ApiProperty({
    example: 'https://www.goodreads.com/book/show/386162',
  })
  url!: string;
}

export class GrFinderSearchResponseDto {
  @ApiProperty({ example: 'hitchhikers guide' })
  query!: string;

  @ApiProperty({ example: 10 })
  count!: number;

  @ApiProperty({ type: [GrFinderSearchResultDto] })
  results!: GrFinderSearchResultDto[];
}

// Link-related DTOs

export class GoodreadsBookDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '386162' })
  goodreadsId!: string;

  @ApiProperty({ example: "The Hitchhiker's Guide to the Galaxy" })
  title!: string;

  @ApiProperty({ example: 'Douglas Adams' })
  author!: string;

  @ApiPropertyOptional({ example: 'A classic science fiction comedy...' })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://images.gr-assets.com/books/1531891848l/386162.jpg',
  })
  coverUrl!: string | null;

  @ApiProperty({ example: 'https://www.goodreads.com/book/show/386162' })
  url!: string;

  @ApiPropertyOptional({ example: '4.22' })
  rating!: string | null;

  @ApiPropertyOptional({ example: 1500000 })
  ratingsCount!: number | null;

  @ApiProperty({ example: ['Science Fiction', 'Comedy', 'Classic'] })
  genres!: string[];

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  syncedAt!: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  updatedAt!: Date;
}

export class GrFinderLinkResponseDto {
  @ApiPropertyOptional({ type: GoodreadsBookDto })
  link!: GoodreadsBookDto | null;
}

export class GrFinderLinkCreatedResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: GoodreadsBookDto })
  link!: GoodreadsBookDto;
}
