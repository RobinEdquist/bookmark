import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportErrorDto {
  @ApiProperty({
    example: 'abc123-def456',
    description: 'Unique identifier for the import error',
  })
  id!: string;

  @ApiProperty({
    example: '/media/audiobooks/Book Title',
    description: 'Path to the file that failed to import',
  })
  filePath!: string;

  @ApiProperty({
    example: 'Failed to extract metadata from audio file',
    description: 'Error message',
  })
  errorMessage!: string;

  @ApiPropertyOptional({
    example: 'Error: ENOENT...',
    description: 'Full error stack trace',
  })
  errorStack?: string | null;

  @ApiProperty({
    example: 'pending',
    enum: ['pending', 'retrying', 'resolved', 'ignored'],
    description: 'Current status of the import error',
  })
  status!: string;

  @ApiPropertyOptional({
    example: 'audiobook',
    enum: ['audiobook', 'ebook'],
    description: 'Type of library item',
  })
  libraryType?: string | null;

  @ApiPropertyOptional({
    example: 'user-123',
    description: 'User ID who marked this as ignored',
  })
  ignoredBy?: string | null;

  @ApiPropertyOptional({
    example: '2024-01-15T12:00:00.000Z',
    description: 'When the error was marked as ignored',
  })
  ignoredAt?: string | null;

  @ApiProperty({
    example: '2024-01-15T12:00:00.000Z',
    description: 'When the error was first recorded',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2024-01-15T12:00:00.000Z',
    description: 'When the error was last updated',
  })
  updatedAt!: string;
}

export class ImportErrorListResponseDto {
  @ApiProperty({ type: [ImportErrorDto], description: 'List of import errors' })
  items!: ImportErrorDto[];

  @ApiProperty({ example: 25, description: 'Total count of matching errors' })
  total!: number;

  @ApiProperty({ example: 50, description: 'Number of items per page' })
  limit!: number;

  @ApiProperty({ example: 0, description: 'Number of items skipped' })
  offset!: number;
}

export class ImportRetryResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the retry was queued successfully',
  })
  success!: boolean;

  @ApiProperty({ example: 'Retry queued', description: 'Response message' })
  message!: string;
}
