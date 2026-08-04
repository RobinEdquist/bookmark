import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EbookPersonDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Brandon Sanderson' })
  name!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'https://example.com/author.jpg',
    nullable: true,
  })
  imageUrl?: string | null;
}

export class EbookSeriesDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Stormlight Archive' })
  name!: string;

  @ApiProperty({ example: '1', description: 'Order in the series' })
  order!: string;
}

export class EbookGenreDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Fantasy' })
  name!: string;
}

export class EbookTagDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Epic' })
  name!: string;
}

export class EbookGoodreadsDataDto {
  @ApiProperty({ example: '12345678', description: 'Goodreads book ID' })
  id!: string;

  @ApiProperty({
    example: 'https://www.goodreads.com/book/show/12345678',
    description: 'Goodreads book URL',
  })
  url!: string;

  @ApiPropertyOptional({ type: Number, example: 4.32, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({ type: Number, example: 250000, nullable: true })
  ratingsCount?: number | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://images.gr-assets.com/books/1234567890.jpg',
    nullable: true,
  })
  coverUrl?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Fantasy', 'Fiction'],
    nullable: true,
  })
  genres?: string[] | null;

  @ApiPropertyOptional({
    type: String,
    example: 'A sweeping epic fantasy novel...',
    nullable: true,
  })
  description?: string | null;
}

export class EbookGeneratedAudiobookDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;
}

export class EbookHardcoverDataDto {
  // Same as HardcoverDataDto: the DB column is text and the runtime emits a
  // string. Keep the DTO honest.
  @ApiProperty({ type: String, example: '12345' })
  id!: string;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiPropertyOptional({ type: Number, example: 4.5, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({ type: Number, example: 15000, nullable: true })
  ratingsCount?: number | null;

  @ApiPropertyOptional({
    type: String,
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

export class EbookListItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: '/api/ebooks/550e8400-e29b-41d4-a716-446655440000/cover',
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

  @ApiProperty({ example: 'epub' })
  format!: string;

  @ApiProperty({ type: [EbookPersonDto] })
  authors!: EbookPersonDto[];

  @ApiProperty({ type: [EbookSeriesDto] })
  series!: EbookSeriesDto[];

  @ApiProperty({
    example: true,
    description: 'Whether linked to Hardcover.app',
  })
  hardcoverLinked!: boolean;

  @ApiPropertyOptional({ type: Number, example: 4.5, nullable: true })
  hardcoverRating?: number | null;

  @ApiPropertyOptional({ type: Number, example: 15000, nullable: true })
  hardcoverRatingsCount?: number | null;
}

export class EbookListResponseDto {
  @ApiProperty({ type: [EbookListItemDto] })
  ebooks!: EbookListItemDto[];

  @ApiProperty({
    example: 100,
    description: 'Total number of ebooks matching filters',
  })
  total!: number;
}

export class EbookDetailDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Book One of The Stormlight Archive',
    nullable: true,
  })
  subtitle?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'A sweeping epic fantasy...',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({ type: String, example: 'Tor Books', nullable: true })
  publisher?: string | null;

  @ApiPropertyOptional({ type: String, example: '2010-08-31', nullable: true })
  publishedDate?: string | null;

  @ApiPropertyOptional({ type: String, example: 'en', nullable: true })
  language?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '978-0765326355',
    nullable: true,
  })
  isbn?: string | null;

  @ApiPropertyOptional({ type: String, example: 'B003P2WO5E', nullable: true })
  asin?: string | null;

  @ApiPropertyOptional({ type: Number, example: 384, nullable: true })
  pageCount?: number | null;

  @ApiProperty({
    example: 'the-way-of-kings.epub',
    description: 'File name, needed by the web reader to open the file',
  })
  fileName!: string;

  @ApiProperty({ example: 'epub' })
  format!: string;

  @ApiProperty({ example: 5242880, description: 'File size in bytes' })
  sizeBytes!: number;

  @ApiProperty({ example: false })
  isExplicit!: boolean;

  @ApiPropertyOptional({
    type: String,
    example: '/api/ebooks/550e8400-e29b-41d4-a716-446655440000/cover',
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

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ type: [EbookPersonDto] })
  authors!: EbookPersonDto[];

  @ApiProperty({ type: [EbookSeriesDto] })
  series!: EbookSeriesDto[];

  @ApiProperty({ type: [EbookGenreDto] })
  genres!: EbookGenreDto[];

  @ApiProperty({ type: [EbookTagDto] })
  tags!: EbookTagDto[];

  @ApiPropertyOptional({ type: EbookHardcoverDataDto, nullable: true })
  hardcover?: EbookHardcoverDataDto | null;

  @ApiPropertyOptional({ type: EbookGoodreadsDataDto, nullable: true })
  goodreads?: EbookGoodreadsDataDto | null;

  @ApiPropertyOptional({
    type: EbookGeneratedAudiobookDto,
    nullable: true,
    description: 'Set when a TTS-generated audiobook exists for this ebook',
  })
  generatedAudiobook?: EbookGeneratedAudiobookDto | null;
}

export class UpdateEbookCoverResponseDto {
  @ApiProperty({
    example: '/api/ebooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;
}
