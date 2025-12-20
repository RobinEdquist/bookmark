import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SeriesEntryDto {
  @ApiProperty({
    description: 'Name of the series',
    example: 'The Lord of the Rings',
  })
  @IsString()
  seriesName!: string;

  @ApiProperty({ description: 'Order/position in the series', example: '1' })
  @IsString()
  order!: string;
}

export class UpdateAudiobookDto {
  @ApiPropertyOptional({
    description: 'Audiobook title',
    example: 'The Fellowship of the Ring',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Audiobook subtitle',
    example: 'Part One of The Lord of the Rings',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  subtitle?: string | null;

  @ApiPropertyOptional({
    description: 'Full description or synopsis',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Publisher name',
    example: 'HarperAudio',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  publisher?: string | null;

  @ApiPropertyOptional({
    description: 'Language code (ISO 639-1)',
    example: 'en',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  language?: string | null;

  @ApiPropertyOptional({
    description: 'Publication date',
    example: '2001-11-12',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  publishedDate?: string | null;

  @ApiPropertyOptional({
    description: 'ISBN-10 or ISBN-13',
    example: '978-0007141296',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  isbn?: string | null;

  @ApiPropertyOptional({
    description: 'Amazon ASIN (10 characters)',
    example: 'B007978NPG',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  asin?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the audiobook contains explicit content',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isExplicit?: boolean;

  @ApiPropertyOptional({
    description: 'List of author names',
    example: ['J.R.R. Tolkien'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorNames?: string[];

  @ApiPropertyOptional({
    description: 'List of narrator names',
    example: ['Rob Inglis'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  narratorNames?: string[];

  @ApiPropertyOptional({
    description: 'List of genre names',
    example: ['Fantasy', 'Adventure'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genreNames?: string[];

  @ApiPropertyOptional({
    description: 'List of tag names',
    example: ['favorite', 'classic'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiPropertyOptional({
    description: 'Series entries with order',
    type: [SeriesEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeriesEntryDto)
  series?: SeriesEntryDto[];
}
