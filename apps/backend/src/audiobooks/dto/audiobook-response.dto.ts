import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PersonDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Brandon Sanderson' })
  name!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/author.jpg',
    nullable: true,
  })
  imageUrl?: string | null;
}

export class SeriesDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Stormlight Archive' })
  name!: string;

  @ApiProperty({ example: '1', description: 'Order in the series' })
  order!: string;
}

export class GenreDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Fantasy' })
  name!: string;
}

export class TagDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Epic' })
  name!: string;
}

export class ChapterDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Chapter 1: The Beginning' })
  title!: string;

  @ApiProperty({ example: 0, description: 'Start time in seconds' })
  startTime!: number;

  @ApiPropertyOptional({
    example: 3600,
    description: 'End time in seconds',
    nullable: true,
  })
  endTime?: number | null;

  @ApiProperty({ example: 1, description: 'Chapter order' })
  order!: number;

  @ApiProperty({ enum: ['embedded', 'external'], example: 'embedded' })
  source!: 'embedded' | 'external';
}

export class AudiobookFileDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'chapter01.mp3' })
  fileName!: string;

  @ApiProperty({ example: 'mp3' })
  format!: string;

  @ApiProperty({ example: 3600, description: 'Duration in seconds' })
  duration!: number;

  @ApiProperty({ example: 52428800, description: 'File size in bytes' })
  sizeBytes!: number;

  @ApiProperty({ example: 0, description: 'Order in multi-file audiobooks' })
  order!: number;
}

export class HardcoverDataDto {
  @ApiProperty({ example: 12345 })
  id!: number;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiPropertyOptional({ example: 4.5, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({ example: 15000, nullable: true })
  ratingsCount?: number | null;

  @ApiPropertyOptional({
    example: 'https://hardcover.app/images/book.jpg',
    nullable: true,
  })
  imageUrl?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Fantasy', 'Epic Fantasy'],
    nullable: true,
  })
  genres?: string[] | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Adventurous', 'Epic'],
    nullable: true,
  })
  moods?: string[] | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Violence'],
    nullable: true,
  })
  contentWarnings?: string[] | null;
}

export class AudiobookListItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Book One of The Stormlight Archive',
    nullable: true,
  })
  subtitle?: string | null;

  @ApiPropertyOptional({
    example: 54000,
    description: 'Duration in seconds',
    nullable: true,
  })
  duration?: number | null;

  @ApiPropertyOptional({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    enum: ['available', 'missing', 'importing'],
    example: 'available',
  })
  status!: 'available' | 'missing' | 'importing';

  @ApiProperty({ type: [PersonDto] })
  authors!: PersonDto[];

  @ApiProperty({ type: [SeriesDto] })
  series!: SeriesDto[];

  @ApiProperty({
    example: true,
    description: 'Whether linked to Hardcover.app',
  })
  hardcoverLinked!: boolean;

  @ApiPropertyOptional({ example: 4.5, nullable: true })
  hardcoverRating?: number | null;

  @ApiPropertyOptional({ example: 15000, nullable: true })
  hardcoverRatingsCount?: number | null;
}

export class AudiobookListResponseDto {
  @ApiProperty({ type: [AudiobookListItemDto] })
  audiobooks!: AudiobookListItemDto[];

  @ApiProperty({
    example: 100,
    description: 'Total number of audiobooks matching filters',
  })
  total!: number;
}

export class AudiobookDetailDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Book One of The Stormlight Archive',
    nullable: true,
  })
  subtitle?: string | null;

  @ApiPropertyOptional({
    example: 'A sweeping epic fantasy...',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({ example: 'Tor Books', nullable: true })
  publisher?: string | null;

  @ApiPropertyOptional({ example: '2010-08-31', nullable: true })
  publishedDate?: string | null;

  @ApiPropertyOptional({ example: 'en', nullable: true })
  language?: string | null;

  @ApiPropertyOptional({ example: '978-0765326355', nullable: true })
  isbn?: string | null;

  @ApiPropertyOptional({ example: 'B003P2WO5E', nullable: true })
  asin?: string | null;

  @ApiPropertyOptional({
    example: 54000,
    description: 'Duration in seconds',
    nullable: true,
  })
  duration?: number | null;

  @ApiProperty({ example: false })
  isExplicit!: boolean;

  @ApiPropertyOptional({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiProperty({
    enum: ['available', 'missing', 'importing', 'hidden'],
    example: 'available',
  })
  status!: string;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: [PersonDto] })
  authors!: PersonDto[];

  @ApiProperty({ type: [PersonDto] })
  narrators!: PersonDto[];

  @ApiProperty({ type: [SeriesDto] })
  series!: SeriesDto[];

  @ApiProperty({ type: [GenreDto] })
  genres!: GenreDto[];

  @ApiProperty({ type: [TagDto] })
  tags!: TagDto[];

  @ApiProperty({ type: [ChapterDto] })
  chapters!: ChapterDto[];

  @ApiProperty({ type: [AudiobookFileDto] })
  files!: AudiobookFileDto[];

  @ApiPropertyOptional({ type: HardcoverDataDto, nullable: true })
  hardcover?: HardcoverDataDto | null;
}

export class UpdateCoverResponseDto {
  @ApiProperty({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;
}

export class RefreshChaptersResponseDto {
  @ApiProperty({ example: 25, description: 'Number of chapters extracted' })
  count!: number;
}
