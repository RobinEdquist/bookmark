import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Core list metadata, without preview covers or item counts.
 * Returned by create/update endpoints.
 */
export class ListDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'auth-user-id-123' })
  userId!: string;

  @ApiProperty({ example: 'My Favorites' })
  name!: string;

  @ApiProperty({ example: false })
  isPublic!: boolean;

  @ApiProperty({ example: '2025-01-15T10:30:00.000Z', type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2025-01-15T10:30:00.000Z', type: String, format: 'date-time' })
  updatedAt!: string;
}

/**
 * List with item count, ownership flag, and up to 3 preview cover URLs.
 * Returned in /api/lists (myLists) and /api/lists/recent.
 */
export class ListWithPreviewDto extends ListDto {
  @ApiProperty({ example: 12, description: 'Number of items in this list' })
  itemCount!: number;

  @ApiProperty({ example: true, description: 'Whether the requesting user owns this list' })
  isOwner!: boolean;

  @ApiProperty({
    type: [String],
    example: [
      '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
      '/api/audiobooks/660e8400-e29b-41d4-a716-446655440001/cover',
    ],
    description: 'Up to 3 cover URLs for the most recently added items',
  })
  previewCovers!: string[];
}

/**
 * Public-list variant exposed on /api/lists (publicLists) — adds the owner's display name.
 */
export class PublicListWithPreviewDto extends ListWithPreviewDto {
  @ApiProperty({ example: 'Jane Doe', description: 'Display name of the list owner' })
  ownerName!: string;
}

/**
 * GET /api/lists response — grouped by ownership.
 */
export class ListsGroupedDto {
  @ApiProperty({ type: [ListWithPreviewDto], description: "Lists owned by the requesting user" })
  myLists!: ListWithPreviewDto[];

  @ApiProperty({ type: [PublicListWithPreviewDto], description: 'Public lists owned by other users' })
  publicLists!: PublicListWithPreviewDto[];
}

/**
 * GET /api/lists/recent response.
 */
export class ListsRecentDto {
  @ApiProperty({ type: [ListWithPreviewDto] })
  lists!: ListWithPreviewDto[];
}

/**
 * Lightweight audiobook summary embedded inside a list item.
 */
export class ListItemAudiobookSummaryDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Dune' })
  title!: string;

  @ApiPropertyOptional({ example: 'A Novel', nullable: true })
  subtitle?: string | null;

  @ApiProperty({ example: 75720, description: 'Duration in seconds' })
  duration!: number;

  @ApiProperty({ example: 'ready', description: 'Indexing/processing status' })
  status!: string;

  @ApiProperty({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;

  @ApiProperty({ type: [String], example: ['Frank Herbert'] })
  authors!: string[];
}

/**
 * Lightweight ebook summary embedded inside a list item.
 */
export class ListItemEbookSummaryDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Dune' })
  title!: string;

  @ApiPropertyOptional({ example: 'A Novel', nullable: true })
  subtitle?: string | null;

  @ApiPropertyOptional({
    example: 412,
    description: 'Number of pages',
    nullable: true,
  })
  pageCount?: number | null;

  @ApiProperty({ example: 'ready' })
  status!: string;

  @ApiProperty({
    example: '/api/ebooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;

  @ApiProperty({ type: [String], example: ['Frank Herbert'] })
  authors!: string[];
}

/**
 * Single item inside a list, with the related audiobook/ebook hydrated.
 */
export class ListItemWithDetailsDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440000' })
  listId!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  itemType!: 'audiobook' | 'ebook';

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  audiobookId?: string | null;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  ebookId?: string | null;

  @ApiProperty({ example: 1, description: 'Sort order within the list' })
  order!: number;

  @ApiProperty({ example: '2025-01-15T10:30:00.000Z', type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: () => ListItemAudiobookSummaryDto,
    nullable: true,
    description: 'Populated when itemType is "audiobook".',
  })
  audiobook?: ListItemAudiobookSummaryDto | null;

  @ApiPropertyOptional({
    type: () => ListItemEbookSummaryDto,
    nullable: true,
    description: 'Populated when itemType is "ebook".',
  })
  ebook?: ListItemEbookSummaryDto | null;
}

/**
 * Bare list item shape (no hydrated audiobook/ebook) returned by addItem.
 */
export class ListItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440000' })
  listId!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  itemType!: 'audiobook' | 'ebook';

  @ApiPropertyOptional({ nullable: true })
  audiobookId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ebookId?: string | null;

  @ApiProperty({ example: 1 })
  order!: number;

  @ApiProperty({ example: '2025-01-15T10:30:00.000Z', type: String, format: 'date-time' })
  createdAt!: string;
}

/**
 * GET /api/lists/{id} response — full list with hydrated items.
 */
export class ListDetailDto extends ListDto {
  @ApiProperty({ type: [ListItemWithDetailsDto] })
  items!: ListItemWithDetailsDto[];

  @ApiProperty({ example: true })
  isOwner!: boolean;
}

/**
 * GET /api/lists/for-item response — list with a containsItem flag.
 */
export class ListWithContainsFlagDto extends ListDto {
  @ApiProperty({ example: false })
  containsItem!: boolean;
}
