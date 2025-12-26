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
