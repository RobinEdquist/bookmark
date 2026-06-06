import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== Stats Endpoint =====

export class UserProfileDto {
  @ApiProperty({ example: 'abc123' })
  id!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  image?: string | null;

  @ApiPropertyOptional({ type: String, example: 'admin', nullable: true })
  role?: string | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;
}

export class UserProfileStatsDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;

  @ApiProperty({
    example: 345600,
    description: 'Total listening time in seconds (all time)',
  })
  totalListeningTime!: number;

  @ApiProperty({ example: 8, description: 'Number of audiobooks completed' })
  audiobooksCompleted!: number;

  @ApiProperty({ example: 3, description: 'Number of audiobooks in progress' })
  audiobooksInProgress!: number;

  @ApiProperty({ example: 5, description: 'Number of ebooks completed' })
  ebooksCompleted!: number;

  @ApiProperty({ example: 2, description: 'Number of ebooks in progress' })
  ebooksInProgress!: number;

  @ApiProperty({
    example: 14,
    description: 'Longest streak of consecutive listening days',
  })
  longestStreak!: number;

  @ApiProperty({
    example: 3,
    description: 'Current streak of consecutive listening days',
  })
  currentStreak!: number;
}

// ===== Activity Endpoint =====

export class UserProfileActivityDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { '2026-01-01': 7200, '2026-01-02': 3600 },
    description: 'Daily listening totals in seconds, keyed by YYYY-MM-DD',
  })
  days!: Record<string, number>;
}

// ===== Library Progress Endpoint =====

export class LibraryProgressItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'] })
  type!: 'audiobook' | 'ebook';

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({ type: String, example: 'Brandon Sanderson', nullable: true })
  authorName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({ example: 45, description: 'Progress percentage (0-100)' })
  progressPercent!: number;

  @ApiProperty({ example: false })
  completed!: boolean;

  @ApiPropertyOptional({ type: String, example: '2024-01-15T12:00:00.000Z', nullable: true })
  completedAt?: string | null;

  @ApiProperty({ example: '2024-01-10T08:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: Number,
    example: 54000,
    description: 'Duration in seconds (audiobooks only)',
    nullable: true,
  })
  duration?: number | null;
}

export class LibraryProgressResponseDto {
  @ApiProperty({ type: [LibraryProgressItemDto] })
  items!: LibraryProgressItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;
}

// ===== Listening History Endpoint =====

export class ListeningHistoryItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  audiobookId!: string;

  @ApiProperty({ example: 'Project Hail Mary' })
  audiobookTitle!: string;

  @ApiPropertyOptional({ type: String, example: 'Andy Weir', nullable: true })
  authorName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({ example: 3600, description: 'Session duration in seconds' })
  durationSeconds!: number;

  @ApiProperty({ example: 12000, description: 'Start position in seconds' })
  startPosition!: number;

  @ApiProperty({ example: 15600, description: 'End position in seconds' })
  endPosition!: number;

  @ApiProperty({ example: '2026-02-09T14:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ example: '2026-02-09T15:00:00.000Z' })
  endedAt!: string;
}

export class ListeningHistoryResponseDto {
  @ApiProperty({ type: [ListeningHistoryItemDto] })
  items!: ListeningHistoryItemDto[];

  @ApiProperty({ example: 150 })
  total!: number;
}
