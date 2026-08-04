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
    type: String,
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
  coverUrl?: string;

  @ApiPropertyOptional({
    example: 3171,
    description: 'Duration in minutes',
  })
  durationMinutes?: number;

  @ApiPropertyOptional({ example: '2010-08-31', description: 'Release date' })
  releaseDate?: string;

  @ApiPropertyOptional({ example: 'english', description: 'Language' })
  language?: string;

  @ApiPropertyOptional({
    example: 'Macmillan Audio',
    description: 'Publisher name',
  })
  publisher?: string;
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

export class AudnexusBookSeriesDto {
  @ApiProperty({ example: 'Stormlight Archive', description: 'Series name' })
  name!: string;

  @ApiPropertyOptional({ example: '1', description: 'Position in series' })
  position?: string;
}

export class AudnexusBookDetailDto {
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
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Book description (may contain HTML)' })
  description?: string;

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
    example: 'Macmillan Audio',
    description: 'Publisher name',
  })
  publisher?: string;

  @ApiPropertyOptional({
    example: '2010-08-31T00:00:00.000Z',
    description: 'Release date',
  })
  releaseDate?: string;

  @ApiPropertyOptional({ example: '9781429992800', description: 'ISBN' })
  isbn?: string;

  @ApiPropertyOptional({
    example: 'english',
    description: 'Language (full name)',
  })
  language?: string;

  @ApiProperty({
    type: [String],
    example: ['Science Fiction & Fantasy'],
    description: 'Genres',
  })
  genres!: string[];

  @ApiProperty({ type: [String], example: ['Epic'], description: 'Tags' })
  tags!: string[];

  @ApiProperty({
    type: [AudnexusBookSeriesDto],
    description: 'Series memberships (primary and secondary)',
  })
  series!: AudnexusBookSeriesDto[];

  @ApiPropertyOptional({
    example: 'https://m.media-amazon.com/images/I/91KzZWpgmyL.jpg',
    description: 'Cover image URL',
  })
  coverUrl?: string;
}

export class ChapterDto {
  @ApiProperty({ example: 'Opening Credits', description: 'Chapter title' })
  title!: string;

  @ApiProperty({ example: 0, description: 'Start time in seconds' })
  startTime!: number;

  @ApiPropertyOptional({ example: 30, description: 'End time in seconds' })
  endTime?: number;

  @ApiProperty({
    example: 30,
    description: 'Chapter length in seconds',
  })
  lengthSeconds!: number;
}

export class ChaptersResponseDto {
  @ApiProperty({
    example: 'B08G9PRS1K',
    description: 'Audible Standard Identification Number',
  })
  asin!: string;

  @ApiProperty({ type: [ChapterDto], description: 'List of chapters' })
  chapters!: ChapterDto[];

  @ApiProperty({ example: 58234, description: 'Total runtime in seconds' })
  totalDuration!: number;

  @ApiProperty({
    example: true,
    description: 'Whether Audnexus marks the chapter timings as accurate',
  })
  isAccurate!: boolean;
}
