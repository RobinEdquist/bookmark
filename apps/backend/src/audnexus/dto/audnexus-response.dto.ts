import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AudibleSearchResultDto {
  @ApiProperty({
    example: 'B08G9PRS1K',
    description: 'Audible Standard Identification Number',
  })
  asin!: string;

  @ApiProperty({ example: 'The Way of Kings', description: 'Book title' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Book One of the Stormlight Archive',
    description: 'Book subtitle',
  })
  subtitle?: string | null;

  @ApiProperty({
    type: [String],
    example: ['Brandon Sanderson'],
    description: 'List of authors',
  })
  authors!: string[];

  @ApiProperty({
    type: [String],
    example: ['Michael Kramer', 'Kate Reading'],
    description: 'List of narrators',
  })
  narrators!: string[];

  @ApiPropertyOptional({
    example: 'https://m.media-amazon.com/images/...',
    description: 'Cover image URL',
  })
  image?: string | null;

  @ApiPropertyOptional({ example: '2010-08-31', description: 'Release date' })
  releaseDate?: string | null;

  @ApiPropertyOptional({
    example: 190260000,
    description: 'Duration in milliseconds',
  })
  lengthMs?: number | null;

  @ApiPropertyOptional({
    example: 'Stormlight Archive',
    description: 'Series name',
  })
  seriesName?: string | null;

  @ApiPropertyOptional({ example: '1', description: 'Position in series' })
  seriesPosition?: string | null;

  @ApiPropertyOptional({ example: 'us', description: 'Audible region' })
  region?: string | null;
}

export class AudibleSearchResponseDto {
  @ApiProperty({
    type: [AudibleSearchResultDto],
    description: 'Search results from Audible',
  })
  results!: AudibleSearchResultDto[];

  @ApiProperty({ example: 10, description: 'Total number of results' })
  total!: number;
}

export class ChapterDto {
  @ApiProperty({ example: 0, description: 'Chapter index' })
  chapterIndex!: number;

  @ApiProperty({ example: 'Opening Credits', description: 'Chapter title' })
  title!: string;

  @ApiProperty({ example: 0, description: 'Start time in milliseconds' })
  startOffsetMs!: number;

  @ApiProperty({ example: 30000, description: 'Start time in seconds' })
  startOffsetSec!: number;

  @ApiProperty({
    example: 30000,
    description: 'Chapter length in milliseconds',
  })
  lengthMs!: number;
}

export class ChaptersResponseDto {
  @ApiProperty({
    example: 'B08G9PRS1K',
    description: 'Audible Standard Identification Number',
  })
  asin!: string;

  @ApiProperty({ example: 'us', description: 'Audible region' })
  region!: string;

  @ApiProperty({ type: [ChapterDto], description: 'List of chapters' })
  chapters!: ChapterDto[];

  @ApiProperty({
    example: 190260000,
    description: 'Total runtime in milliseconds',
  })
  runtimeLengthMs!: number;

  @ApiProperty({ example: 190260, description: 'Total runtime in seconds' })
  runtimeLengthSec!: number;
}
