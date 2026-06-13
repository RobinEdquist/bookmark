import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
  ValidateNested,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

const METADATA_SOURCES = [
  'manual',
  'embedded',
  'hardcover',
  'goodreads',
  'filename',
  'folder_image',
] as const;

export class MetadataFieldPriorityInputDto {
  @ApiPropertyOptional({
    description: 'Priority order for title metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover', 'filename'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  title?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for subtitle metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  subtitle?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for author metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover', 'filename'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  author?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for narrator metadata sources',
    type: [String],
    example: ['manual', 'embedded'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  narrator?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for description metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  description?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for publisher metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  publisher?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for published date metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  publishedDate?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for language metadata sources',
    type: [String],
    example: ['manual', 'embedded'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  language?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for genres metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  genres?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for series metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover', 'filename'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  series?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for series order metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover', 'filename'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  seriesOrder?: string[];

  @ApiPropertyOptional({
    description: 'Priority order for cover image metadata sources',
    type: [String],
    example: ['manual', 'embedded', 'hardcover', 'folder_image'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(METADATA_SOURCES, { each: true })
  cover?: string[];
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether new user signups are enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  signupsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Path to the audiobook library directory',
    example: '/media/audiobooks',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  audiobookLibraryPath?: string | null;

  @ApiPropertyOptional({
    description: 'Path to the ebook library directory',
    example: '/media/ebooks',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ebookLibraryPath?: string | null;

  @ApiPropertyOptional({
    description: 'Path to the comic library directory',
    example: '/media/comics',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  comicLibraryPath?: string | null;

  @ApiPropertyOptional({
    description: 'Metadata source priority configuration',
    type: MetadataFieldPriorityInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetadataFieldPriorityInputDto)
  metadataPriority?: MetadataFieldPriorityInputDto;

  @ApiPropertyOptional({
    description: 'Whether OPDS feed is enabled',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  opdsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Custom text for the OIDC login button',
    example: 'Sign in with SSO',
  })
  @IsOptional()
  @IsString()
  oidcButtonText?: string;

  @ApiPropertyOptional({
    description: 'Whether email/password authentication is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailPasswordEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'OIDC auto-create users setting',
    example: 'auto',
    enum: ['auto', 'pending', 'disabled'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'pending', 'disabled'])
  oidcAutoCreateUsers?: string;

  @ApiPropertyOptional({
    description: 'Whether content requests feature is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requestsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'MAM category for audiobook requests',
    example: 'audiobooks',
  })
  @IsOptional()
  @IsString()
  requestsAudiobookCategory?: string;

  @ApiPropertyOptional({
    description: 'MAM category for ebook requests',
    example: 'books',
  })
  @IsOptional()
  @IsString()
  requestsEbookCategory?: string;

  @ApiPropertyOptional({
    description: 'MAM category for comics requests',
    example: 'comics',
  })
  @IsOptional()
  @IsString()
  requestsComicsCategory?: string;

  @ApiPropertyOptional({
    description: 'Number of requests each user can auto-approve per week',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoApproveRequestsPerWeek?: number;

  @ApiPropertyOptional({
    description:
      'Whether to use personal freeleech wedges when downloading requested content',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  requestsUseFreeleech?: boolean;

  @ApiPropertyOptional({
    description: 'Default permission for new users to edit metadata',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  defaultCanEditMetadata?: boolean;

  @ApiPropertyOptional({
    description: 'Default permission for new users to upload content',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  defaultCanUpload?: boolean;

  @ApiPropertyOptional({
    description: 'Default permission for new users to delete content',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  defaultCanDelete?: boolean;

  @ApiPropertyOptional({
    description: 'Default permission for new users to generate API keys',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  defaultCanGenerateApiKeys?: boolean;

  @ApiPropertyOptional({
    description: 'Default permission for new users to request content',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  defaultCanRequestContent?: boolean;
}
