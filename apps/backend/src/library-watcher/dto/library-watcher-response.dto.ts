import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LibraryWatcherStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the watcher is actively monitoring',
  })
  isWatching!: boolean;

  @ApiPropertyOptional({
    type: String,
    example: '2024-01-15T12:00:00.000Z',
    nullable: true,
  })
  lastScanAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '/media/audiobooks',
    nullable: true,
  })
  audiobookLibraryPath?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '/media/ebooks',
    nullable: true,
  })
  ebookLibraryPath?: string | null;
}

export class ScanErrorDto {
  @ApiProperty({ example: '/library/audiobooks/Author/Title' })
  path!: string;

  @ApiProperty({ example: 'Unsupported audio codec' })
  error!: string;
}

export class LibraryScanResultDto {
  @ApiProperty({ example: 5, description: 'New items imported' })
  added!: number;

  @ApiProperty({
    example: 1,
    description: 'Items whose folder or file is gone, now marked missing',
  })
  missing!: number;

  @ApiProperty({
    example: 0,
    description: 'Missing items whose files came back',
  })
  restored!: number;

  @ApiProperty({
    example: 0,
    description: 'Hidden items deleted because their files are gone',
  })
  deleted!: number;

  @ApiProperty({
    example: 1,
    description:
      'Known audiobooks whose stored tracks were gone from disk, so their file list was rebuilt (always 0 for ebooks and comics)',
  })
  repaired!: number;

  @ApiProperty({ type: [ScanErrorDto] })
  errors!: ScanErrorDto[];
}

export class LibraryScanResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: LibraryScanResultDto })
  result!: LibraryScanResultDto;
}

export class RescanResultDto {
  @ApiProperty({ example: 120, description: 'Items queued for rescan' })
  total!: number;

  @ApiProperty({ example: 118 })
  succeeded!: number;

  @ApiProperty({ example: 2 })
  failed!: number;
}

export class LibraryRescanResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: RescanResultDto })
  result!: RescanResultDto;
}

export class HiddenAudiobookDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Skeleton Crew' })
  title!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Stephen King/Skeleton Crew',
    description:
      'Folder relative to the audiobook library; null for a single file in the library root',
  })
  folderPath!: string | null;
}

export class HiddenAudiobooksResponseDto {
  @ApiProperty({ type: [HiddenAudiobookDto] })
  items!: HiddenAudiobookDto[];
}

export class RestoreHiddenAudiobookResponseDto {
  @ApiProperty({
    enum: ['restored', 'removed'],
    example: 'restored',
    description:
      "'restored': back in the library. 'removed': its folder no longer exists, so the record was deleted.",
  })
  outcome!: 'restored' | 'removed';
}

export class RescanStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether a rescan is currently running',
  })
  isRunning!: boolean;

  @ApiPropertyOptional({ example: 50, description: 'Total items to rescan' })
  total?: number;

  @ApiPropertyOptional({ example: 25, description: 'Items already processed' })
  processed?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Percentage complete (0-100)',
  })
  percentage?: number;

  @ApiPropertyOptional({
    example: 'Processing The Way of Kings',
    description: 'Current item being processed',
  })
  currentItem?: string;
}
