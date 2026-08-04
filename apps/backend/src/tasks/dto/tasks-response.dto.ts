import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoodreadsLinkTaskStatusDto } from '../../gr-finder/dto/gr-finder-response.dto';

export class ImportQueueStatusDto {
  @ApiProperty({ example: 5 })
  pendingCount!: number;

  @ApiProperty({ type: [String], example: ['The Way of Kings', 'Mistborn'] })
  pendingNames!: string[];
}

export class ImportStatusDto {
  @ApiProperty({ type: ImportQueueStatusDto })
  audiobooks!: ImportQueueStatusDto;

  @ApiProperty({ type: ImportQueueStatusDto })
  ebooks!: ImportQueueStatusDto;

  @ApiProperty({ type: ImportQueueStatusDto })
  comics!: ImportQueueStatusDto;
}

export class HardcoverSyncStatusDto {
  @ApiProperty({ example: 10 })
  pendingCount!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;
}

export class ScanProgressDto {
  @ApiProperty({ example: true })
  isScanning!: boolean;

  // Matches LibraryScannerService's actual phases — the documented
  // discovery/processing pair never existed at runtime.
  @ApiPropertyOptional({
    example: 'scanning',
    enum: ['reconciling', 'scanning', 'importing'],
  })
  phase?: 'reconciling' | 'scanning' | 'importing';

  @ApiPropertyOptional({ example: 100 })
  total?: number;

  @ApiPropertyOptional({ example: 50 })
  processed?: number;

  @ApiPropertyOptional({ example: 50 })
  percentage?: number;

  @ApiPropertyOptional({ example: 'The Way of Kings' })
  currentFile?: string;
}

export class TtsActiveJobDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  jobId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  ebookId!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  ebookTitle!: string;

  @ApiProperty({
    example: 'generating',
    enum: ['extracting', 'generating', 'assembling', 'importing'],
  })
  phase!: 'extracting' | 'generating' | 'assembling' | 'importing';

  @ApiProperty({ type: Number, example: 42, nullable: true })
  totalChapters!: number | null;

  @ApiProperty({ example: 7 })
  completedChapters!: number;

  @ApiProperty({ type: Number, example: 17, nullable: true })
  percentage!: number | null;

  @ApiProperty({ type: String, example: 'Chapter 8', nullable: true })
  currentChapterTitle!: string | null;
}

export class TtsTaskStatusDto {
  @ApiProperty({ type: TtsActiveJobDto, nullable: true })
  active!: TtsActiveJobDto | null;

  @ApiProperty({ example: 2 })
  pendingCount!: number;

  @ApiProperty({ example: 0 })
  failedCount!: number;
}

export class TasksStatusResponseDto {
  @ApiProperty({ type: ImportStatusDto })
  import!: ImportStatusDto;

  @ApiProperty({ type: HardcoverSyncStatusDto })
  hardcoverSync!: HardcoverSyncStatusDto;

  @ApiProperty({ type: ScanProgressDto })
  scan!: ScanProgressDto;

  @ApiProperty({ type: TtsTaskStatusDto })
  tts!: TtsTaskStatusDto;

  // Reuses the gr-finder DTO rather than restating it — one class per payload.
  @ApiProperty({ type: GoodreadsLinkTaskStatusDto })
  goodreadsLink!: GoodreadsLinkTaskStatusDto;
}
