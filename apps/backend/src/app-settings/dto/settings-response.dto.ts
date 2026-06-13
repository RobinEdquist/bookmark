import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetadataFieldPriorityDto {
  @ApiProperty({ type: [String], example: ['embedded', 'hardcover', 'manual'] })
  title!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'manual'] })
  subtitle!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'hardcover', 'manual'] })
  author!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'hardcover', 'manual'] })
  description!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'manual'] })
  publisher!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'manual'] })
  publishedDate!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'manual'] })
  language!: string[];

  @ApiProperty({ type: [String], example: ['embedded', 'hardcover', 'manual'] })
  series!: string[];

  @ApiProperty({
    type: [String],
    example: ['embedded', 'hardcover', 'folder_image', 'manual'],
  })
  cover!: string[];
}

export class PublicSettingsResponseDto {
  @ApiProperty({ example: true })
  signupsEnabled!: boolean;
}

export class AuthConfigResponseDto {
  @ApiProperty({ example: true })
  emailPasswordEnabled!: boolean;

  @ApiProperty({ example: false })
  oidcEnabled!: boolean;

  @ApiPropertyOptional({ example: 'Sign in with SSO', nullable: true })
  oidcButtonText?: string | null;
}

export class SetupStatusResponseDto {
  @ApiProperty({ example: true })
  setupCompleted!: boolean;
}

export class AppSettingsResponseDto {
  @ApiProperty({ example: true })
  signupsEnabled!: boolean;

  @ApiPropertyOptional({ example: '/media/audiobooks', nullable: true })
  audiobookLibraryPath?: string | null;

  @ApiPropertyOptional({ example: '/media/ebooks', nullable: true })
  ebookLibraryPath?: string | null;

  @ApiPropertyOptional({ example: '/media/comics', nullable: true })
  comicLibraryPath?: string | null;

  @ApiProperty({ example: true })
  opdsEnabled!: boolean;

  @ApiProperty({ type: MetadataFieldPriorityDto })
  metadataPriority!: MetadataFieldPriorityDto;

  @ApiPropertyOptional({ example: 'Sign in with SSO', nullable: true })
  oidcButtonText?: string | null;

  @ApiProperty({ example: true })
  emailPasswordEnabled!: boolean;

  @ApiProperty({ example: 'auto', enum: ['auto', 'pending', 'disabled'] })
  oidcAutoCreateUsers!: string;

  @ApiProperty({ example: true })
  requestsEnabled!: boolean;

  @ApiPropertyOptional({ example: 'audiobooks', nullable: true })
  requestsAudiobookCategory?: string | null;

  @ApiPropertyOptional({ example: 'ebooks', nullable: true })
  requestsEbookCategory?: string | null;

  @ApiPropertyOptional({ example: 'comics', nullable: true })
  requestsComicsCategory?: string | null;

  @ApiProperty({ example: 5 })
  autoApproveRequestsPerWeek!: number;

  @ApiProperty({
    example: false,
    description:
      'Whether to use personal freeleech wedges when downloading requested content',
  })
  requestsUseFreeleech!: boolean;

  @ApiProperty({ example: true })
  defaultCanEditMetadata!: boolean;

  @ApiProperty({ example: false })
  defaultCanUpload!: boolean;

  @ApiProperty({ example: false })
  defaultCanDelete!: boolean;

  @ApiProperty({ example: true })
  defaultCanGenerateApiKeys!: boolean;

  @ApiProperty({ example: true })
  defaultCanRequestContent!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether MAM client is configured via environment variables',
  })
  mamClientConfigured!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether Goodreads Finder is configured via GR_FINDER_URL environment variable',
  })
  grFinderConfigured!: boolean;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-20T08:00:00.000Z' })
  updatedAt!: Date;
}
