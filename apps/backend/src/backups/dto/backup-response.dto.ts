import { ApiProperty } from '@nestjs/swagger';

export class BackupEntryDto {
  @ApiProperty({ example: 'bookmark-20260815T020000000Z' })
  id!: string;

  @ApiProperty({ example: 'bookmark-20260815T020000000Z.bookmark' })
  filename!: string;

  @ApiProperty({ example: '2026-08-15T02:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Archive size in bytes', example: 104857600 })
  size!: number;

  @ApiProperty({ example: '0.2.0' })
  appVersion!: string;
}

export class BackupConfigDto {
  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ example: '/data/backups' })
  path!: string;

  @ApiProperty({
    description:
      'True when the location is fixed by the BACKUP_PATH environment variable',
    example: false,
  })
  pathLocked!: boolean;

  @ApiProperty({ example: '0 2 * * *' })
  schedule!: string;

  @ApiProperty({ example: 7 })
  retention!: number;

  @ApiProperty({ example: 'UTC' })
  timezone!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-16T02:00:00.000Z',
  })
  nextBackupAt!: string | null;

  @ApiProperty({ example: false })
  isRunning!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why the configured backup location is unusable, or null',
  })
  pathError!: string | null;
}

export class BackupOverviewDto {
  @ApiProperty({ type: BackupConfigDto })
  config!: BackupConfigDto;

  @ApiProperty({ type: [BackupEntryDto] })
  backups!: BackupEntryDto[];
}

export class RestoreBackupResponseDto {
  @ApiProperty({ example: true })
  restored!: boolean;

  @ApiProperty({ example: true })
  restartRequired!: boolean;
}
