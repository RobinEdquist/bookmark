import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// ComicVine response DTOs
// ---------------------------------------------------------------------------
// One class per JSON-returning endpoint (and its nested objects), enforced as
// both the controller return type and the Swagger @ApiResponse type. Shapes
// are derived from ComicvineService return statements — runtime wins.
// ---------------------------------------------------------------------------

// ============ Status / Configuration ============

export class ComicvineStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether API key is configured' })
  configured!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether to auto-sync new comic imports',
  })
  autoSyncOnImport!: boolean;
}

export class ComicvineValidateResponseDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiPropertyOptional({ example: 'Invalid API key' })
  error?: string;
}

export class ComicvineAutoSyncResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: true })
  autoSyncOnImport!: boolean;
}

// ============ Raw ComicVine building blocks ============

export class CvImageDto {
  @ApiPropertyOptional({
    example: 'https://comicvine.gamespot.com/a/medium.jpg',
  })
  medium_url?: string;

  @ApiPropertyOptional({
    example: 'https://comicvine.gamespot.com/a/original.jpg',
  })
  original_url?: string;
}

export class CvPublisherDto {
  @ApiProperty({ example: 'DC Comics' })
  name!: string;
}

export class CvVolumeRefDto {
  @ApiProperty({ example: 4050 })
  id!: number;

  @ApiProperty({ example: 'Batman' })
  name!: string;
}

export class CvPersonCreditDto {
  @ApiProperty({ example: 'Scott Snyder' })
  name!: string;

  @ApiProperty({ example: 'writer' })
  role!: string;
}

export class CvCharacterCreditDto {
  @ApiProperty({ example: 'Batman' })
  name!: string;
}

export class CvStoryArcCreditDto {
  @ApiProperty({ example: 'The Court of Owls' })
  name!: string;
}

/**
 * A raw ComicVine volume search hit, annotated with `isCollected`. Mirrors
 * `CvVolumeRaw & { isCollected: boolean }` from the service.
 */
export class CvVolumeResultDto {
  @ApiProperty({ example: 4050 })
  id!: number;

  @ApiProperty({ example: 'Batman' })
  name!: string;

  @ApiPropertyOptional({ example: 2011, nullable: true })
  start_year?: number | string | null;

  @ApiPropertyOptional({ type: CvPublisherDto, nullable: true })
  publisher?: CvPublisherDto | null;

  @ApiPropertyOptional({ example: 52, nullable: true })
  count_of_issues?: number | null;

  @ApiPropertyOptional({ example: 'The Dark Knight...', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ type: CvImageDto, nullable: true })
  image?: CvImageDto | null;

  @ApiPropertyOptional({
    example: 'https://comicvine.gamespot.com/batman/4050-4050/',
    nullable: true,
  })
  site_detail_url?: string | null;

  @ApiProperty({
    example: false,
    description:
      'True when the volume name indicates a collected/trade edition',
  })
  isCollected!: boolean;
}

/**
 * A raw ComicVine issue payload. Mirrors `CvIssueRaw` from the service.
 */
export class CvIssueResultDto {
  @ApiProperty({ example: 401234 })
  id!: number;

  @ApiPropertyOptional({ example: '1', nullable: true })
  issue_number?: string | null;

  @ApiPropertyOptional({ example: 'Knife Trick', nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ example: '2011-11-01', nullable: true })
  cover_date?: string | null;

  @ApiPropertyOptional({ example: '2011-09-21', nullable: true })
  store_date?: string | null;

  @ApiPropertyOptional({ type: CvVolumeRefDto, nullable: true })
  volume?: CvVolumeRefDto | null;

  @ApiPropertyOptional({ type: [CvPersonCreditDto], nullable: true })
  person_credits?: CvPersonCreditDto[] | null;

  @ApiPropertyOptional({ type: [CvCharacterCreditDto], nullable: true })
  character_credits?: CvCharacterCreditDto[] | null;

  @ApiPropertyOptional({ type: [CvStoryArcCreditDto], nullable: true })
  story_arc_credits?: CvStoryArcCreditDto[] | null;

  @ApiPropertyOptional({ example: 'An epic tale...', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ type: CvImageDto, nullable: true })
  image?: CvImageDto | null;

  @ApiPropertyOptional({ nullable: true })
  site_detail_url?: string | null;
}

// ============ Cached rows (link data) ============

export class CvPersonCreditEntryDto {
  @ApiProperty({ example: 'Scott Snyder' })
  name!: string;

  @ApiProperty({ example: 'writer' })
  role!: string;
}

/**
 * A cached ComicVine volume row (`comicvine_volumes`), returned as series link
 * data. Mirrors `CachedVolume`; dates serialise to ISO strings over the wire.
 */
export class CachedVolumeDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 4050 })
  comicvineVolumeId!: number;

  @ApiProperty({ example: 'Batman' })
  name!: string;

  @ApiPropertyOptional({ example: 2011, nullable: true })
  startYear!: number | null;

  @ApiPropertyOptional({ example: 'DC Comics', nullable: true })
  publisherName!: string | null;

  @ApiPropertyOptional({ example: 52, nullable: true })
  countOfIssues!: number | null;

  @ApiPropertyOptional({ example: 'The Dark Knight...', nullable: true })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://comicvine.gamespot.com/a/medium.jpg',
    nullable: true,
  })
  imageUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  siteDetailUrl!: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  syncedAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

/**
 * A cached ComicVine issue row (`comicvine_issues`), returned as book link
 * data. Mirrors `CachedIssue`; dates serialise to ISO strings over the wire.
 */
export class CachedIssueDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 401234 })
  comicvineIssueId!: number;

  @ApiPropertyOptional({ example: 4050, nullable: true })
  comicvineVolumeId!: number | null;

  @ApiPropertyOptional({ example: '1', nullable: true })
  issueNumber!: string | null;

  @ApiPropertyOptional({ example: 'Knife Trick', nullable: true })
  name!: string | null;

  @ApiPropertyOptional({ example: '2011-11-01', nullable: true })
  coverDate!: string | null;

  @ApiPropertyOptional({ example: '2011-09-21', nullable: true })
  storeDate!: string | null;

  @ApiPropertyOptional({ example: 'An epic tale...', nullable: true })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://comicvine.gamespot.com/a/medium.jpg',
    nullable: true,
  })
  imageUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  siteDetailUrl!: string | null;

  @ApiProperty({ type: [CvPersonCreditEntryDto] })
  personCredits!: { name: string; role: string }[];

  @ApiProperty({ type: [String], example: ['Batman'] })
  characterCredits!: string[];

  @ApiProperty({ type: [String], example: ['The Court of Owls'] })
  storyArcCredits!: string[];

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  syncedAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// ============ Volume search responses ============

export class ComicvineVolumeSearchResponseDto {
  @ApiProperty({ example: 42 })
  totalResults!: number;

  @ApiProperty({ type: [CvVolumeResultDto] })
  results!: CvVolumeResultDto[];
}

/**
 * Response of `GET /comicvine/search/volume-for-series/:seriesId`: the volume
 * search prefilled from the series title, plus the resolved query and the
 * series' current link (if any).
 */
export class ComicvineVolumeForSeriesResponseDto extends ComicvineVolumeSearchResponseDto {
  @ApiProperty({ example: 'Batman' })
  query!: string;

  @ApiPropertyOptional({ type: CachedVolumeDto, nullable: true })
  currentLink!: CachedVolumeDto | null;
}

// ============ Volume issues responses ============

export class ComicvineVolumeIssuesResponseDto {
  @ApiProperty({ example: 52 })
  totalResults!: number;

  @ApiProperty({ type: [CachedIssueDto] })
  issues!: CachedIssueDto[];
}

/**
 * Response of `GET /comicvine/search/issue-for-book/:bookId`: the linked
 * volume's issues plus a `linkedVolume` flag (false when the series is not
 * linked to a ComicVine volume).
 */
export class ComicvineIssuesForBookResponseDto extends ComicvineVolumeIssuesResponseDto {
  @ApiProperty({ example: true })
  linkedVolume!: boolean;
}

// ============ Link get / set responses ============

export class ComicvineSeriesLinkResponseDto {
  @ApiPropertyOptional({ type: CachedVolumeDto, nullable: true })
  link!: CachedVolumeDto | null;
}

export class ComicvineLinkSeriesResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: CachedVolumeDto })
  link!: CachedVolumeDto;
}

export class ComicvineBookLinkResponseDto {
  @ApiPropertyOptional({ type: CachedIssueDto, nullable: true })
  link!: CachedIssueDto | null;
}

export class ComicvineLinkBookResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: CachedIssueDto })
  link!: CachedIssueDto;
}

// ============ Sync queue responses ============

export class ComicvineQueueItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: ['series', 'book'], example: 'series' })
  level!: 'series' | 'book';

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  seriesId!: string | null;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  bookId!: string | null;

  @ApiProperty({
    enum: ['pending', 'processing', 'failed', 'needs_review'],
    example: 'pending',
  })
  status!: 'pending' | 'processing' | 'failed' | 'needs_review';

  @ApiPropertyOptional({ example: 'No confident match found', nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({
    example: 'Batman',
    nullable: true,
    description: 'Series or book title for display',
  })
  title!: string | null;
}

export class ComicvineQueueStatusResponseDto {
  @ApiProperty({ example: 10 })
  pendingCount!: number;

  @ApiProperty({ example: 3 })
  needsReviewCount!: number;

  @ApiProperty({ example: 1 })
  failedCount!: number;

  @ApiProperty({ type: [ComicvineQueueItemDto] })
  items!: ComicvineQueueItemDto[];
}

export class ComicvineQueueCountResponseDto {
  @ApiProperty({ example: 15 })
  queuedCount!: number;
}
