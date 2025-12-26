import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RequestStatus, ContentType } from '../schema';

export class SeriesInfoDto {
  @ApiProperty({ example: 'The Stormlight Archive' })
  name!: string;

  @ApiPropertyOptional({ example: '1', nullable: true })
  number?: string | null;
}

export class ContentRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId!: string;

  @ApiProperty({ example: 'john@example.com' })
  userEmail!: string;

  @ApiProperty({
    enum: ['pending', 'approved', 'rejected', 'fulfilled'],
    example: 'pending',
  })
  status!: 'pending' | 'approved' | 'rejected' | 'fulfilled';

  @ApiProperty({ example: '12345' })
  mamTorrentId!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({ example: 'Brandon Sanderson', nullable: true })
  author?: string | null;

  @ApiPropertyOptional({ example: 'Michael Kramer', nullable: true })
  narrator?: string | null;

  @ApiPropertyOptional({ example: 'The Stormlight Archive #1', nullable: true })
  series?: string | null;

  @ApiPropertyOptional({ example: 'An epic fantasy...', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/cover.jpg',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({ enum: ['audiobook', 'ebook', 'comics'], example: 'audiobook' })
  contentType!: 'audiobook' | 'ebook' | 'comics';

  @ApiPropertyOptional({ example: 'Already in library', nullable: true })
  rejectionReason?: string | null;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  libraryItemId?: string | null;

  @ApiPropertyOptional({
    enum: ['audiobook', 'ebook', 'comics'],
    nullable: true,
  })
  libraryItemType?: 'audiobook' | 'ebook' | 'comics' | null;

  @ApiProperty({ example: 5 })
  supporterCount!: number;

  @ApiProperty({ example: true })
  isSupporter!: boolean;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  autoApprovedByUserId?: string | null;

  @ApiPropertyOptional({ example: 'john@example.com', nullable: true })
  autoApprovedByEmail?: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: string;
}

export class MamSearchResultItemDto {
  @ApiProperty({ example: 12345 })
  id!: number;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({ example: 'Brandon Sanderson', nullable: true })
  author?: string | null;

  @ApiPropertyOptional({ example: 'Michael Kramer', nullable: true })
  narrator?: string | null;

  @ApiPropertyOptional({ type: [SeriesInfoDto], nullable: true })
  series?: SeriesInfoDto[] | null;

  @ApiPropertyOptional({ example: 'An epic fantasy...', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/cover.jpg',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  contentType!: 'audiobook' | 'ebook';

  @ApiProperty({ example: 'Audiobooks' })
  category!: string;

  @ApiProperty({ example: 13 })
  mamCategory!: number;

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
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  existingRequestId?: string | null;

  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected', 'fulfilled'],
    nullable: true,
  })
  existingRequestStatus?:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'fulfilled'
    | null;

  @ApiProperty({ example: false })
  inLibrary!: boolean;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  libraryItemId?: string | null;
}

export class MamSearchResponseDto {
  @ApiProperty({ type: [MamSearchResultItemDto] })
  results!: MamSearchResultItemDto[];

  @ApiProperty({ example: 25 })
  total!: number;
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
  mamTorrentId: string;
  title: string;
  author: string | null;
  narrator: string | null;
  series: string | null;
  description: string | null;
  coverUrl: string | null;
  contentType: ContentType;
  rejectionReason: string | null;
  libraryItemId: string | null;
  libraryItemType: ContentType | null;
  supporterCount: number;
  isSupporter: boolean;
  autoApprovedByUserId: string | null;
  autoApprovedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MamSearchResultDto {
  id: number;
  title: string;
  author: string | null;
  narrator: string | null;
  series: SeriesInfo[] | null;
  description: string | null;
  coverUrl: string | null;
  contentType: 'audiobook' | 'ebook';
  category: string;
  mamCategory: number;
  size: string;
  language: string;
  fileType: string;
  tags: string[];
  addedDate: string;
  existingRequestId: string | null;
  existingRequestStatus: RequestStatus | null;
  inLibrary: boolean;
  libraryItemId: string | null;
}

export interface SearchMamResponseDto {
  results: MamSearchResultDto[];
  total: number;
}
