import { IsString, IsOptional, IsIn, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRequestDto {
  @ApiProperty({
    description: 'Tracker torrent ID',
    example: 123456,
  })
  @IsInt()
  torrentId!: number;

  @ApiProperty({
    description: 'Title of the requested content',
    example: 'The Hobbit',
  })
  @IsString()
  title!: string;

  @ApiPropertyOptional({
    description: 'Author of the content',
    example: 'J.R.R. Tolkien',
  })
  @IsOptional()
  @IsString()
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
    enum: ['audiobook', 'ebook'],
  })
  @IsIn(['audiobook', 'ebook'])
  contentType!: 'audiobook' | 'ebook';

  @ApiProperty({
    description: 'Tracker category ID',
    example: 13,
  })
  @IsInt()
  categoryId!: number;
}
