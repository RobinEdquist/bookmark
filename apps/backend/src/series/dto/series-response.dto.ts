import { ApiProperty } from '@nestjs/swagger';

const BOOK_STATUSES = ['available', 'missing', 'importing', 'hidden'] as const;
type BookStatus = (typeof BOOK_STATUSES)[number];

/** A cover thumbnail for a book in the series list (stacked-cover preview). */
export class SeriesBookCoverDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/api/audiobooks/abc123/cover',
    description: 'Cover image API URL, or null when no cover is available',
  })
  coverUrl!: string | null;
}

/** A series with a few preview covers, as returned by list endpoints. */
export class SeriesWithBooksDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({ example: 'The Lord of the Rings' })
  name!: string;

  @ApiProperty({
    example: 3,
    description: 'Total books in the series (audiobooks + ebooks)',
  })
  bookCount!: number;

  @ApiProperty({
    type: [SeriesBookCoverDto],
    description: 'Up to 3 audiobooks',
  })
  audiobooks!: SeriesBookCoverDto[];

  @ApiProperty({ type: [SeriesBookCoverDto], description: 'Up to 3 ebooks' })
  ebooks!: SeriesBookCoverDto[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Most recent book addition/update across formats',
  })
  lastUpdated!: Date;
}

/** Response of GET /series/recently-updated. */
export class RecentlyUpdatedSeriesResponseDto {
  @ApiProperty({ type: [SeriesWithBooksDto] })
  series!: SeriesWithBooksDto[];
}

/** Response of GET /series (paginated list). */
export class SeriesListResponseDto {
  @ApiProperty({ type: [SeriesWithBooksDto] })
  series!: SeriesWithBooksDto[];

  @ApiProperty({ example: 25, description: 'Total number of matching series' })
  total!: number;
}

export class SeriesBookAuthorDto {
  @ApiProperty({ example: 'J.R.R. Tolkien' })
  name!: string;
}

export class SeriesDetailAudiobookDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({ example: 'The Fellowship of the Ring' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/api/audiobooks/abc123/cover',
  })
  coverUrl!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Duration in seconds',
  })
  duration!: number | null;

  @ApiProperty({ type: [SeriesBookAuthorDto] })
  authors!: SeriesBookAuthorDto[];

  @ApiProperty({ example: '1', description: 'Position within the series' })
  order!: string;

  @ApiProperty({ enum: BOOK_STATUSES, example: 'available' })
  status!: BookStatus;
}

export class SeriesDetailEbookDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({ example: 'The Fellowship of the Ring' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/api/ebooks/abc123/cover',
  })
  coverUrl!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  pageCount!: number | null;

  @ApiProperty({ type: [SeriesBookAuthorDto] })
  authors!: SeriesBookAuthorDto[];

  @ApiProperty({ example: '1', description: 'Position within the series' })
  order!: string;

  @ApiProperty({ enum: BOOK_STATUSES, example: 'available' })
  status!: BookStatus;
}

/** Response of GET /series/:id. */
export class SeriesDetailResponseDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({ example: 'The Lord of the Rings' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: [SeriesDetailAudiobookDto] })
  audiobooks!: SeriesDetailAudiobookDto[];

  @ApiProperty({ type: [SeriesDetailEbookDto] })
  ebooks!: SeriesDetailEbookDto[];

  @ApiProperty({ example: 3 })
  audiobookCount!: number;

  @ApiProperty({ example: 0 })
  ebookCount!: number;
}

/** Response of PATCH /series/:id. */
export class UpdatedSeriesResponseDto {
  @ApiProperty({ example: 'abc123-def456' })
  id!: string;

  @ApiProperty({ example: 'The Lord of the Rings' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
}
