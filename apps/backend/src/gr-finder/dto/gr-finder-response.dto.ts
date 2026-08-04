import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrFinderStatusResponseDto {
  @ApiProperty({
    example: true,
    description:
      'Whether Goodreads lookups are available. Always true — the scraper is built into the server.',
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
    type: String,
    example: 'https://images.gr-assets.com/books/1531891848l/386162.jpg',
  })
  cover_url!: string | null;

  @ApiPropertyOptional({ type: String, example: '4.22' })
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

/**
 * Full book details from `GET /gr-finder/book/:goodreadsId`. Mirrors the
 * gr-finder service's `GrFinderBookDetails` — the scraped book payload.
 */
export class GrFinderBookDetailsDto {
  @ApiProperty({ example: "The Hitchhiker's Guide to the Galaxy" })
  title!: string;

  @ApiProperty({ example: 'Douglas Adams' })
  author!: string;

  @ApiPropertyOptional({ example: '386162' })
  goodreads_id?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'https://images.gr-assets.com/books/1531891848l/386162.jpg',
    nullable: true,
  })
  cover_url!: string | null;

  @ApiPropertyOptional({ type: Number, example: 4.22, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({
    example: 'https://www.goodreads.com/book/show/386162',
  })
  url?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'A classic science fiction comedy...',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ type: [String], example: ['Science Fiction', 'Comedy'] })
  genres!: string[];

  @ApiPropertyOptional({ type: Number, example: 1500000, nullable: true })
  rating_count?: number | null;

  @ApiPropertyOptional({
    type: String,
    example: "The Hitchhiker's Guide to the Galaxy",
    nullable: true,
  })
  series?: string | null;

  @ApiPropertyOptional({ type: String, example: '1', nullable: true })
  series_number?: string | null;
}

// Link-related DTOs

export class GoodreadsBookDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '386162' })
  goodreadsId!: string;

  @ApiProperty({ example: "The Hitchhiker's Guide to the Galaxy" })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Book One',
    nullable: true,
    description:
      'Present on the link-create response (full row); omitted from the ' +
      'link-get projection',
  })
  subtitle?: string | null;

  @ApiProperty({ example: 'Douglas Adams' })
  author!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'A classic science fiction comedy...',
  })
  description!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://images.gr-assets.com/books/1531891848l/386162.jpg',
  })
  coverUrl!: string | null;

  @ApiProperty({ example: 'https://www.goodreads.com/book/show/386162' })
  url!: string;

  @ApiPropertyOptional({ type: String, example: '4.22' })
  rating!: string | null;

  @ApiPropertyOptional({ type: Number, example: 1500000 })
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

export class GoodreadsLinkJobDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  jobId!: string;

  @ApiProperty({ example: 'ebook', enum: ['audiobook', 'ebook'] })
  mediaType!: 'audiobook' | 'ebook';

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  mediaId!: string;

  @ApiProperty({ example: 'The Chilango Burrito Bible' })
  bookTitle!: string;
}

export class GoodreadsLinkFailureDto extends GoodreadsLinkJobDto {
  @ApiProperty({ example: 'Could not read the Goodreads book page.' })
  error!: string;
}

export class GoodreadsLinkTaskStatusDto {
  // Always present, null when idle — hence @ApiProperty, not the Optional form.
  @ApiProperty({ type: GoodreadsLinkJobDto, nullable: true })
  active!: GoodreadsLinkJobDto | null;

  @ApiProperty({ example: 0 })
  pendingCount!: number;

  @ApiProperty({ example: 0 })
  failedCount!: number;

  @ApiProperty({ type: [GoodreadsLinkFailureDto] })
  failures!: GoodreadsLinkFailureDto[];
}

export class GrFinderLinkQueuedResponseDto {
  @ApiProperty({
    example: true,
    description: 'The link was queued; watch the tasks status for its outcome',
  })
  queued!: boolean;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  jobId!: string;
}

export class GrFinderLinkResponseDto {
  @ApiPropertyOptional({ type: GoodreadsBookDto })
  link!: GoodreadsBookDto | null;
}
