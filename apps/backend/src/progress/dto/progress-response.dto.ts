import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgressResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  audiobookId!: string;

  @ApiProperty({ example: 3600, description: 'Current position in seconds' })
  position!: number;

  @ApiProperty({ example: false })
  completed!: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T12:00:00.000Z', nullable: true })
  completedAt?: string | null;

  @ApiProperty({ example: '2024-01-10T08:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: string;
}

export class ProgressAudiobookDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiPropertyOptional({
    example: 54000,
    description: 'Duration in seconds',
    nullable: true,
  })
  duration?: number | null;
}

export class ProgressWithAudiobookDto extends ProgressResponseDto {
  @ApiProperty({ type: ProgressAudiobookDto })
  audiobook!: ProgressAudiobookDto;

  @ApiProperty({ example: 25, description: 'Progress percentage (0-100)' })
  progressPercent!: number;
}

export class PeriodStatsDto {
  @ApiProperty({
    example: 7200,
    description: 'Total listening time in seconds',
  })
  durationSeconds!: number;

  @ApiProperty({ example: 5, description: 'Number of listening sessions' })
  sessionsCount!: number;
}

export class AllTimeStatsDto {
  @ApiProperty({
    example: 360000,
    description: 'Total listening time in seconds',
  })
  durationSeconds!: number;

  @ApiProperty({ example: 15, description: 'Number of audiobooks started' })
  audiobooksStarted!: number;

  @ApiProperty({ example: 8, description: 'Number of audiobooks completed' })
  audiobooksCompleted!: number;
}

export class ListeningStatsDto {
  @ApiProperty({ type: PeriodStatsDto })
  today!: PeriodStatsDto;

  @ApiProperty({ type: PeriodStatsDto })
  thisWeek!: PeriodStatsDto;

  @ApiProperty({ type: PeriodStatsDto })
  thisMonth!: PeriodStatsDto;

  @ApiProperty({ type: AllTimeStatsDto })
  allTime!: AllTimeStatsDto;

  @ApiProperty({ type: [ProgressWithAudiobookDto] })
  recentlyPlayed!: ProgressWithAudiobookDto[];
}

export class CreateSessionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 1800, description: 'Session duration in seconds' })
  durationSeconds!: number;
}

// Mobile-friendly listening stats DTOs

export class ListeningStatsItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Project Hail Mary' })
  title!: string;

  @ApiPropertyOptional({ example: 'Andy Weir', nullable: true })
  authorName?: string | null;

  @ApiPropertyOptional({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({
    example: 54000,
    description: 'Time listening in seconds',
  })
  timeListening!: number;
}

export class RecentSessionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  audiobookId!: string;

  @ApiProperty({ example: 'Project Hail Mary' })
  audiobookTitle!: string;

  @ApiPropertyOptional({ example: 'Andy Weir', nullable: true })
  authorName?: string | null;

  @ApiPropertyOptional({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({
    example: '2026-02-09',
    description: 'Date in YYYY-MM-DD format',
  })
  date!: string;

  @ApiProperty({ example: 3600, description: 'Time listening in seconds' })
  timeListening!: number;

  @ApiProperty({ example: 12000, description: 'Start position in seconds' })
  startPosition!: number;

  @ApiProperty({ example: 15600, description: 'End position in seconds' })
  endPosition!: number;

  @ApiProperty({ example: '2026-02-09T14:00:00.000Z' })
  startedAt!: string;

  @ApiProperty({ example: '2026-02-09T15:00:00.000Z' })
  endedAt!: string;
}

export class MobileListeningStatsDto {
  @ApiProperty({
    example: 345600,
    description: 'Total listening time in seconds (all time)',
  })
  totalTime!: number;

  @ApiProperty({
    example: 3600,
    description: "Today's listening time in seconds",
  })
  today!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      $ref: '#/components/schemas/ListeningStatsItemDto',
    },
    description: 'Per-audiobook listening stats keyed by audiobook ID',
  })
  items!: Record<string, ListeningStatsItemDto>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { '2026-02-01': 7200, '2026-02-02': 3600 },
    description:
      'Daily listening totals for contribution graph (YYYY-MM-DD keys)',
  })
  days!: Record<string, number>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: {
      Sunday: 7200,
      Monday: 3600,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 5400,
      Friday: 0,
      Saturday: 0,
    },
    description: 'Aggregated listening time by day of week',
  })
  dayOfWeek!: Record<string, number>;

  @ApiProperty({ type: [RecentSessionDto] })
  recentSessions!: RecentSessionDto[];
}
