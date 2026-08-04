import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { HardcoverImage } from '../hardcover.service';

export class HardcoverStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether API key is configured' })
  configured!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether to auto-sync new imports',
  })
  autoSyncOnImport!: boolean;
}

export class HardcoverAutoSyncResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: true })
  autoSyncOnImport!: boolean;
}

export class HardcoverValidateResponseDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiPropertyOptional({ example: 'Invalid or expired API key' })
  error?: string;
}

/** Mirrors the `HardcoverImage` service type. */
export class HardcoverImageDto {
  @ApiPropertyOptional({
    example: 'https://hardcover.app/images/book.jpg',
  })
  url?: string;

  @ApiPropertyOptional({ example: 1200 })
  id?: number;

  @ApiPropertyOptional({ example: 400 })
  width?: number;

  @ApiPropertyOptional({ example: 600 })
  height?: number;

  @ApiPropertyOptional({ example: '#2f4f4f' })
  color?: string;

  @ApiPropertyOptional({ example: 'dark slate gray' })
  color_name?: string;
}

/**
 * A single Hardcover typesense "hit" document. This mirrors the
 * `HardcoverBookDocument` service type — the raw book payload returned inside
 * `search.results.hits[].document`. All fields are public book metadata.
 */
export class HardcoverBookResultDto {
  @ApiProperty({ example: '12345' })
  id!: string;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiProperty({ type: [String], example: ['Brandon Sanderson'] })
  author_names!: string[];

  @ApiProperty({ example: 4.5 })
  rating!: number;

  @ApiProperty({ example: 15000 })
  ratings_count!: number;

  @ApiPropertyOptional({
    type: HardcoverImageDto,
    description: 'Cover image metadata from Hardcover',
  })
  image?: HardcoverImage;

  @ApiProperty({ type: [String], example: ['Fantasy', 'Epic Fantasy'] })
  genres!: string[];

  @ApiProperty({ type: [String], example: ['Adventurous'] })
  moods!: string[];

  @ApiProperty({ type: [String], example: ['Violence'] })
  content_warnings!: string[];

  @ApiProperty({ type: [String], example: ['978-0765326355'] })
  isbns!: string[];
}

/**
 * A typesense search hit wrapping a book document. The service returns the raw
 * search payload verbatim, so this mirrors `HardcoverSearchHit`.
 */
export class HardcoverSearchHitDto {
  @ApiProperty({ type: HardcoverBookResultDto })
  document!: HardcoverBookResultDto;

  @ApiProperty({ example: 578730123 })
  text_match!: number;
}

/**
 * The typesense results block: `search.results`. Mirrors
 * `HardcoverSearchResults` from the service.
 */
export class HardcoverSearchResultsDto {
  @ApiProperty({ example: 25 })
  found!: number;

  @ApiProperty({ type: [HardcoverSearchHitDto] })
  hits!: HardcoverSearchHitDto[];

  @ApiProperty({ example: 250 })
  out_of!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 12 })
  search_time_ms!: number;
}

export class HardcoverSearchDataDto {
  @ApiProperty({ type: HardcoverSearchResultsDto })
  results!: HardcoverSearchResultsDto;
}

/**
 * Response of `GET /hardcover/search` — the raw Hardcover GraphQL search
 * response, returned verbatim as `{ search: { results } }`.
 */
export class HardcoverSearchResponseDto {
  @ApiProperty({ type: HardcoverSearchDataDto })
  search!: HardcoverSearchDataDto;
}

/**
 * Response of `GET /hardcover/search/{audiobook,ebook}/:id` — the raw search
 * response plus the resolved query string the backend searched with.
 */
export class HardcoverMediaSearchResponseDto extends HardcoverSearchResponseDto {
  @ApiProperty({ example: 'The Way of Kings' })
  query!: string;
}

/**
 * Mirrors a row of the `hardcover_books` table, which the link endpoints
 * return verbatim. Field names and nullability track the Drizzle schema.
 */
export class HardcoverLinkDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '12345' })
  hardcoverId!: string;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Book One of the Stormlight Archive',
    nullable: true,
  })
  subtitle!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'An epic fantasy novel',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ type: [String], example: ['Brandon Sanderson'] })
  authorNames!: string[];

  @ApiProperty({ type: [String], example: ['Violence'] })
  contentWarnings!: string[];

  @ApiPropertyOptional({
    type: String,
    example: 'The Stormlight Archive',
    nullable: true,
  })
  featuredSeriesName!: string | null;

  @ApiPropertyOptional({ type: String, example: '1.0', nullable: true })
  featuredSeriesPosition!: string | null;

  @ApiProperty({ type: [String], example: ['Fantasy', 'Epic Fantasy'] })
  genres!: string[];

  @ApiPropertyOptional({
    type: String,
    example: 'https://hardcover.app/images/book.jpg',
    nullable: true,
  })
  imageUrl!: string | null;

  @ApiProperty({ type: [String], example: ['978-0765326355'] })
  isbns!: string[];

  @ApiProperty({ type: [String], example: ['Adventurous'] })
  moods!: string[];

  @ApiPropertyOptional({ type: String, example: '4.50', nullable: true })
  rating!: string | null;

  @ApiPropertyOptional({ type: Number, example: 15000, nullable: true })
  ratingsCount!: number | null;

  @ApiProperty({ type: [String], example: ['fantasy'] })
  tags!: string[];

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  syncedAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

export class HardcoverLinkResponseDto {
  @ApiPropertyOptional({ type: HardcoverLinkDataDto, nullable: true })
  link?: HardcoverLinkDataDto | null;
}

export class HardcoverLinkCreatedResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: HardcoverLinkDataDto })
  link!: HardcoverLinkDataDto;
}

export class HardcoverFailedItemMediaDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  type!: 'audiobook' | 'ebook';

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Book One of the Stormlight Archive',
    nullable: true,
  })
  subtitle!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '/api/audiobooks/550e8400/cover',
    nullable: true,
  })
  coverUrl!: string | null;
}

export class HardcoverFailedItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  audiobookId!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  ebookId!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'API rate limit exceeded',
    nullable: true,
  })
  errorMessage!: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: HardcoverFailedItemMediaDto, nullable: true })
  media!: HardcoverFailedItemMediaDto | null;
}

export class HardcoverQueueStatusResponseDto {
  @ApiProperty({ example: 10 })
  pendingCount!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;

  @ApiProperty({ type: [HardcoverFailedItemDto] })
  failedItems!: HardcoverFailedItemDto[];
}

export class HardcoverQueueCountResponseDto {
  @ApiProperty({ example: 15 })
  queuedCount!: number;
}
