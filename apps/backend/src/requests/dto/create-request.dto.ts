import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRequestDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    nullable: true,
    description:
      'Selected release ID from the current module. Omit or null to request a book before a release exists. Requires categoryId when supplied.',
    example: 123456,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  torrentId?: number;

  @ApiProperty({
    description: 'Title of the requested content',
    minLength: 1,
    maxLength: 500,
    example: 'The Hobbit',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({
    description: 'Author of the content',
    maxLength: 500,
    example: 'J.R.R. Tolkien',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  author?: string;

  @ApiPropertyOptional({
    description: 'Narrator (for audiobooks)',
    example: 'Rob Inglis',
  })
  @IsOptional()
  @IsString()
  narrator?: string;

  @ApiPropertyOptional({
    description: 'Series name if part of a series',
    example: 'Middle-earth Universe',
  })
  @IsOptional()
  @IsString()
  series?: string;

  @ApiPropertyOptional({
    description: 'Description of the content',
    example: 'A fantasy adventure novel...',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'URL to cover image',
    example: 'https://example.com/cover.jpg',
  })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiProperty({
    description: 'Type of content being requested',
    example: 'audiobook',
    enum: ['audiobook', 'ebook', 'comics'],
  })
  @IsIn(['audiobook', 'ebook', 'comics'])
  contentType!: 'audiobook' | 'ebook' | 'comics';

  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Category ID from the selected search result. Required when torrentId is non-null; optional for a book without a selected release.',
    example: 13,
  })
  @ValidateIf(
    (dto: CreateRequestDto) => dto.torrentId != null || dto.categoryId != null,
  )
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'integer' },
    maxItems: 20,
    description:
      'Accepted language IDs from GET /api/requests/languages. Omit or use an empty array for any language. IDs are validated against the current module and deduplicated.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  languages?: number[];

  @ApiPropertyOptional({
    description: 'Language reported by a selected search result',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  language?: string;
}
