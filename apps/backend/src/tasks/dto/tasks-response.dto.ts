import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    example: 'scanning',
    enum: ['discovery', 'scanning', 'processing'],
  })
  phase?: 'discovery' | 'scanning' | 'processing';

  @ApiPropertyOptional({ example: 100 })
  total?: number;

  @ApiPropertyOptional({ example: 50 })
  processed?: number;

  @ApiPropertyOptional({ example: 50 })
  percentage?: number;

  @ApiPropertyOptional({ example: 'The Way of Kings' })
  currentFile?: string;
}

export class TasksStatusResponseDto {
  @ApiProperty({ type: ImportStatusDto })
  import!: ImportStatusDto;

  @ApiProperty({ type: HardcoverSyncStatusDto })
  hardcoverSync!: HardcoverSyncStatusDto;

  @ApiProperty({ type: ScanProgressDto })
  scan!: ScanProgressDto;
}
