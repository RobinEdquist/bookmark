import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RequestStatus, ContentType } from '../schema';

export class SeriesInfoDto {
  @ApiProperty({ example: 'The Stormlight Archive' })
  name!: string;

  @ApiPropertyOptional({ type: String, example: '1', nullable: true })
  number?: string | null;
}

export class ContentRequestDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId!: string;

  @ApiProperty({ example: 'john@example.com' })
  userEmail!: string;

  @ApiProperty({
    enum: [
      'pending',
      'approved',
      'waiting',
      'downloading',
      'complete',
      'rejected',
    ],
    example: 'pending',
    description:
      'pending: awaiting approval, with or without a release; waiting: approved and awaiting a matching release; approved: submission recorded or awaiting download progress; downloading: transfer in progress; complete: imported into the library; rejected: declined.',
  })
  status!: RequestStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '12345',
    description:
      'Selected release ID; null while no matching release is selected',
  })
  torrentId!: string | null;

  @ApiProperty({
    description:
      'Server-generated normalized title and author identity. Medium and accepted languages also determine request compatibility.',
  })
  bookKey!: string;

  @ApiProperty({
    type: [String],
    description: 'Accepted content languages; empty means any',
  })
  languageNames!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Time of the single approval, preserved across replacement attempts. Null until approved.',
  })
  approvedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Most recent availability check, or null if never checked',
  })
  lastSearchAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Earliest scheduled availability check, subject to shared rate limits and search leases; null if no check is scheduled',
  })
  nextSearchAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Publication date supplied by the configured module for this book intent',
  })
  releaseDate!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Sanitized reason for the last failed availability check; null when clear',
  })
  searchError!: string | null;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiProperty({
    type: String,
    example: 'Brandon Sanderson',
    nullable: true,
  })
  author!: string | null;

  @ApiProperty({
    type: String,
    example: 'Michael Kramer',
    nullable: true,
  })
  narrator!: string | null;

  @ApiProperty({
    type: String,
    example: 'The Stormlight Archive #1',
    nullable: true,
  })
  series!: string | null;

  @ApiProperty({
    type: String,
    example: 'An epic fantasy...',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    type: String,
    example: 'https://example.com/cover.jpg',
    nullable: true,
  })
  coverUrl!: string | null;

  @ApiProperty({ enum: ['audiobook', 'ebook', 'comics'], example: 'audiobook' })
  contentType!: 'audiobook' | 'ebook' | 'comics';

  @ApiProperty({
    type: String,
    example: 'Already in library',
    nullable: true,
  })
  rejectionReason!: string | null;

  @ApiProperty({
    type: String,
    example: '2024-01-15T12:00:00.000Z',
    format: 'date-time',
    nullable: true,
    description:
      'When the download client first reported this torrent as unknown. Null while the torrent is present.',
  })
  torrentMissingSince!: string | null;

  @ApiProperty({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  libraryItemId!: string | null;

  @ApiProperty({
    type: String,
    enum: ['audiobook', 'ebook', 'comics'],
    nullable: true,
  })
  libraryItemType!: 'audiobook' | 'ebook' | 'comics' | null;

  @ApiProperty({ type: 'integer', example: 5 })
  supporterCount!: number;

  @ApiProperty({ example: true })
  isSupporter!: boolean;

  @ApiProperty({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  autoApprovedByUserId!: string | null;

  @ApiProperty({
    type: String,
    example: 'john@example.com',
    nullable: true,
  })
  autoApprovedByEmail!: string | null;

  @ApiProperty({ format: 'date-time', example: '2024-01-15T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: string;
}

export class TrackerSearchResultItemDto {
  @ApiProperty({ example: 12345 })
  id!: number;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Brandon Sanderson',
    nullable: true,
  })
  author?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Michael Kramer',
    nullable: true,
  })
  narrator?: string | null;

  @ApiPropertyOptional({ type: [SeriesInfoDto], nullable: true })
  series?: SeriesInfoDto[] | null;

  @ApiPropertyOptional({
    type: String,
    example: 'An epic fantasy...',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://example.com/cover.jpg',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({
    enum: ['audiobook', 'ebook', 'comics'],
    example: 'audiobook',
  })
  contentType!: 'audiobook' | 'ebook' | 'comics';

  @ApiProperty({ example: 'Audiobooks' })
  category!: string;

  @ApiProperty({ example: 13 })
  categoryId!: number;

  @ApiProperty({ example: '2.5 GB' })
  size!: string;

  @ApiProperty({ example: 'English' })
  language!: string;

  @ApiProperty({ example: 'M4B' })
  fileType!: string;

  @ApiProperty({ type: [String], example: ['Fantasy', 'Epic'] })
  tags!: string[];

  @ApiProperty({ example: '2024-01-15' })
  addedDate!: string;

  @ApiPropertyOptional({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  existingRequestId?: string | null;

  @ApiPropertyOptional({
    enum: [
      'pending',
      'approved',
      'waiting',
      'downloading',
      'complete',
      'rejected',
    ],
    nullable: true,
  })
  existingRequestStatus?: RequestStatus | null;

  @ApiProperty({
    example: false,
    description:
      'True when the existing request was made by the caller, who therefore cannot support it',
  })
  existingRequestIsMine!: boolean;

  @ApiProperty({ example: false })
  inLibrary!: boolean;

  @ApiPropertyOptional({
    enum: ['confirmed', 'possible'],
    nullable: true,
    description:
      'confirmed is an exact same-medium title match and sets inLibrary. possible is a suggestion and does not block requesting.',
  })
  libraryMatch?: 'confirmed' | 'possible' | null;

  @ApiPropertyOptional({
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  libraryItemId?: string | null;
}

export class TrackerSearchResponseDto {
  @ApiProperty({ type: [TrackerSearchResultItemDto] })
  results!: TrackerSearchResultItemDto[];

  @ApiProperty({ example: 25 })
  total!: number;
}

export class TrackerLanguageDto {
  @ApiProperty({
    example: 1,
    description: "Language ID in the content request module's own taxonomy",
  })
  id!: number;

  @ApiProperty({ example: 'English' })
  name!: string;
}

export class TrackerLanguagesResponseDto {
  @ApiProperty({
    type: [TrackerLanguageDto],
    description:
      'Languages the module can filter by; empty when the module has no language taxonomy',
  })
  languages!: TrackerLanguageDto[];
}

export class RequestListResponseDto {
  @ApiProperty({ type: [ContentRequestDto] })
  requests!: ContentRequestDto[];

  @ApiProperty({ example: 25 })
  total!: number;
}

export class AutoApproveBudgetDto {
  @ApiProperty({
    example: 2,
    description: 'Number of auto-approvals used this week',
  })
  used!: number;

  @ApiProperty({ example: 5, description: 'Weekly auto-approval limit' })
  limit!: number;

  @ApiProperty({ example: 3, description: 'Remaining auto-approvals' })
  remaining!: number;

  @ApiProperty({
    example: '2024-01-22T00:00:00.000Z',
    format: 'date-time',
    description: 'When the budget resets (next Monday UTC)',
  })
  resetsAt!: string;
}

// Keep the interfaces for backward compatibility with services
export interface SeriesInfo {
  name: string;
  number: string | null;
}

export interface RequestResponseDto {
  id: string;
  userId: string;
  userEmail: string;
  status: RequestStatus;
  torrentId: string | null;
  bookKey: string;
  languageNames: string[];
  approvedAt: string | null;
  lastSearchAt: string | null;
  nextSearchAt: string | null;
  releaseDate: string | null;
  searchError: string | null;
  title: string;
  author: string | null;
  narrator: string | null;
  series: string | null;
  description: string | null;
  coverUrl: string | null;
  contentType: ContentType;
  rejectionReason: string | null;
  torrentMissingSince: string | null;
  libraryItemId: string | null;
  libraryItemType: ContentType | null;
  supporterCount: number;
  isSupporter: boolean;
  autoApprovedByUserId: string | null;
  autoApprovedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerSearchResultDto {
  id: number;
  title: string;
  author: string | null;
  narrator: string | null;
  series: SeriesInfo[] | null;
  description: string | null;
  coverUrl: string | null;
  contentType: 'audiobook' | 'ebook' | 'comics';
  category: string;
  categoryId: number;
  size: string;
  language: string;
  fileType: string;
  tags: string[];
  addedDate: string;
  existingRequestId: string | null;
  existingRequestStatus: RequestStatus | null;
  existingRequestIsMine: boolean;
  inLibrary: boolean;
  libraryMatch?: 'confirmed' | 'possible' | null;
  libraryItemId: string | null;
}

export interface TrackerSearchResultsDto {
  results: TrackerSearchResultDto[];
  total: number;
}
