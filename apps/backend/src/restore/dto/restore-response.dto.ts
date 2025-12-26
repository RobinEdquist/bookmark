import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LibraryInfoDto {
  @ApiProperty({ example: 'lib-123', description: 'Library ID from backup' })
  id!: string;

  @ApiProperty({ example: 'Audiobooks', description: 'Library name' })
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['/media/audiobooks'],
    description: 'Library folder paths',
  })
  folders!: string[];
}

export class RestoreSessionDto {
  @ApiProperty({
    example: 'session-123',
    description: 'Unique session identifier',
  })
  id!: string;

  @ApiProperty({
    example: 'library_selection',
    enum: [
      'uploading',
      'library_selection',
      'path_mapping',
      'user_mapping',
      'options',
      'preview',
      'importing',
      'complete',
      'error',
    ],
    description: 'Current state of the restore session',
  })
  state!: string;

  @ApiPropertyOptional({
    type: [LibraryInfoDto],
    description: 'Available libraries from backup',
  })
  availableLibraries?: LibraryInfoDto[];

  @ApiPropertyOptional({
    example: 'lib-123',
    description: 'Selected library ID',
  })
  selectedLibraryId?: string | null;

  @ApiPropertyOptional({
    example: '2024-01-15T12:00:00.000Z',
    description: 'When session was created',
  })
  createdAt?: string;
}

export class UploadBackupResponseDto {
  @ApiProperty({ example: true, description: 'Whether upload was successful' })
  success!: boolean;

  @ApiProperty({ description: 'Session information' })
  session!: {
    id: string;
    state: string;
    availableLibraries?: LibraryInfoDto[];
  };
}

export class RestoreSuccessMessageDto {
  @ApiProperty({
    example: true,
    description: 'Whether operation was successful',
  })
  success!: boolean;

  @ApiProperty({
    example: 'Library selected successfully',
    description: 'Success message',
  })
  message!: string;
}

export class AudiobookPreviewItemDto {
  @ApiProperty({ example: 'Book Title', description: 'Title of the audiobook' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Author Name',
    description: 'Author of the audiobook',
  })
  author?: string | null;

  @ApiProperty({
    example: '/media/audiobooks/Book Title',
    description: 'File path',
  })
  path!: string;
}

export class ImportPreviewDto {
  @ApiProperty({
    description: 'Audiobooks to import',
    example: {
      count: 50,
      items: [{ title: 'Book 1', author: 'Author 1', path: '/path/to/book' }],
    },
  })
  audiobooksToImport!: {
    count: number;
    items: AudiobookPreviewItemDto[];
  };

  @ApiProperty({
    description: 'Audiobooks that will be skipped',
    example: {
      count: 5,
      items: [{ title: 'Book 2', author: 'Author 2', path: '/path/to/book2' }],
    },
  })
  audiobooksToSkip!: {
    count: number;
    items: AudiobookPreviewItemDto[];
  };

  @ApiProperty({
    example: 0,
    description: 'Number of progress records to import',
  })
  progressToImport!: number;
}

export class BookmarkUserDto {
  @ApiProperty({ example: 'user-123', description: 'User ID' })
  id!: string;

  @ApiProperty({ example: 'John Doe', description: 'User display name' })
  name!: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  email!: string;
}
