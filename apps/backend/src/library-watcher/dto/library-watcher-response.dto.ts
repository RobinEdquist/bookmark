import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LibraryWatcherStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the watcher is actively monitoring',
  })
  isWatching!: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T12:00:00.000Z', nullable: true })
  lastScanAt?: string | null;

  @ApiPropertyOptional({ example: '/media/audiobooks', nullable: true })
  audiobookLibraryPath?: string | null;

  @ApiPropertyOptional({ example: '/media/ebooks', nullable: true })
  ebookLibraryPath?: string | null;
}

export class ScanResultDto {
  @ApiProperty({ example: 5, description: 'Number of new items discovered' })
  newCount!: number;

  @ApiProperty({ example: 2, description: 'Number of items with errors' })
  errorCount!: number;

  @ApiProperty({ example: 100, description: 'Total items scanned' })
  totalScanned!: number;
}

export class LibraryScanResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ScanResultDto })
  result!: ScanResultDto;
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
