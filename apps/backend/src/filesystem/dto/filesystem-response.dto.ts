import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileItemDto {
  @ApiProperty({
    example: 'audiobooks',
    description: 'Name of the file or directory',
  })
  name!: string;

  @ApiProperty({
    example: '/media/audiobooks',
    description: 'Full path to the file or directory',
  })
  path!: string;

  @ApiProperty({ example: true, description: 'Whether this is a directory' })
  isDirectory!: boolean;

  @ApiPropertyOptional({
    example: 1024,
    description: 'File size in bytes (only for files)',
  })
  size?: number;
}

export class BrowseResultDto {
  @ApiProperty({ example: '/media', description: 'Current directory path' })
  currentPath!: string;

  @ApiPropertyOptional({
    example: '/',
    description: 'Parent directory path (null for root)',
  })
  parentPath?: string | null;

  @ApiProperty({
    type: [FileItemDto],
    description: 'List of files and directories',
  })
  items!: FileItemDto[];
}

export class DirectoryInfoDto {
  @ApiProperty({
    example: '/media/new-library',
    description: 'Path to the created directory',
  })
  path!: string;

  @ApiProperty({
    example: 'new-library',
    description: 'Name of the created directory',
  })
  name!: string;
}
