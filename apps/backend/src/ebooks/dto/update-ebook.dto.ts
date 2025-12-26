import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EbookSeriesEntryDto {
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

export class UpdateEbookDto {
  @ApiPropertyOptional({
    description: 'Ebook title',
    example: 'The Fellowship of the Ring',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Ebook subtitle',
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
    example: 'Houghton Mifflin',
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
    example: '1954-07-29',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  publishedDate?: string | null;

  @ApiPropertyOptional({
    description: 'ISBN-10 or ISBN-13',
    example: '978-0547928210',
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
    description: 'Number of pages',
    example: 423,
  })
  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @ApiPropertyOptional({
    description: 'Whether the ebook contains explicit content',
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
    type: [EbookSeriesEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EbookSeriesEntryDto)
  series?: EbookSeriesEntryDto[];
}
