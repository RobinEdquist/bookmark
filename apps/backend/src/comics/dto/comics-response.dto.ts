// apps/backend/src/comics/dto/comics-response.dto.ts
//
// Response DTOs for the Comics module. These classes are the declared return
// types of the service/controller methods AND the Swagger `@ApiResponse` types,
// so a payload that leaks an internal column (filePath / folderPath / secrets)
// or drifts from the documented shape becomes a compile error. See the
// "API Response DTOs" section in the root CLAUDE.md.
//
// NOTE: `createdAt` / `updatedAt` are Postgres `timestamp` columns, so Drizzle
// hands them back as JS `Date` objects (serialized to ISO strings by Nest's
// JSON layer). They are typed as `Date` here to match the actual runtime value
// the services return, and documented as ISO date-time strings for Swagger.

import { ApiProperty } from '@nestjs/swagger';

// Shared string unions mirrored from the Drizzle enums in schema.ts.
type ComicStatus = 'available' | 'missing' | 'importing' | 'hidden';
type ComicBookFormat =
  | 'single_issue'
  | 'annual'
  | 'tpb'
  | 'omnibus'
  | 'compendium'
  | 'one_shot'
  | 'special'
  | 'graphic_novel'
  | 'other';
type ComicContainer = 'cbz' | 'cbr' | 'pdf';
type ComicCreatorRole =
  | 'writer'
  | 'penciller'
  | 'inker'
  | 'colorist'
  | 'letterer'
  | 'cover_artist'
  | 'editor'
  | 'other';

const COMIC_STATUSES: ComicStatus[] = [
  'available',
  'missing',
  'importing',
  'hidden',
];
const COMIC_BOOK_FORMATS: ComicBookFormat[] = [
  'single_issue',
  'annual',
  'tpb',
  'omnibus',
  'compendium',
  'one_shot',
  'special',
  'graphic_novel',
  'other',
];
const COMIC_CONTAINERS: ComicContainer[] = ['cbz', 'cbr', 'pdf'];
const COMIC_CREATOR_ROLES: ComicCreatorRole[] = [
  'writer',
  'penciller',
  'inker',
  'colorist',
  'letterer',
  'cover_artist',
  'editor',
  'other',
];

// ===== SHARED NESTED SHAPES =====

export class ComicNamedRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ComicCreatorRefDto {
  @ApiProperty({ format: 'uuid', description: 'Person id' })
  personId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: COMIC_CREATOR_ROLES })
  role!: ComicCreatorRole;
}

export class ComicBookCreatorRefDto extends ComicCreatorRefDto {
  @ApiProperty({ description: 'Ordering within the role' })
  order!: number;
}

// ===== SERIES LIST =====

export class ComicSeriesListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  publisher!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  startYear!: number | null;

  @ApiProperty({ enum: COMIC_STATUSES })
  status!: ComicStatus;

  @ApiProperty()
  bookCount!: number;

  @ApiProperty({ nullable: true, type: Number })
  totalIssueCount!: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'API cover URL (e.g. /api/comics/series/{id}/cover)',
  })
  coverUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty()
  comicvineLinked!: boolean;
}

export class ComicSeriesListResponseDto {
  @ApiProperty({ type: [ComicSeriesListItemDto] })
  series!: ComicSeriesListItemDto[];

  @ApiProperty()
  total!: number;
}

// ===== BOOK LIST ITEM (used inside series detail) =====

export class ComicBookListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  seriesId!: string;

  @ApiProperty({ nullable: true, type: String })
  title!: string | null;

  @ApiProperty({ nullable: true, type: String })
  number!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  sortNumber!: number | null;

  @ApiProperty({ enum: COMIC_BOOK_FORMATS })
  format!: ComicBookFormat;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date',
    description: 'YYYY-MM-DD',
  })
  coverDate!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  pageCount!: number | null;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ enum: COMIC_CONTAINERS })
  container!: ComicContainer;

  @ApiProperty({ enum: COMIC_STATUSES })
  status!: ComicStatus;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Descriptor of collected issues, e.g. "#1-54"',
  })
  collects!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;
}

// ===== SERIES DETAIL =====

export class ComicSeriesComicvineDto {
  @ApiProperty()
  linked!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  volumeId!: number | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String })
  siteDetailUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl!: string | null;
}

export class ComicAggregatedTagsDto {
  @ApiProperty({ type: [String] })
  storyArcs!: string[];

  @ApiProperty({ type: [String] })
  characters!: string[];
}

export class ComicSeriesDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  sortTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String })
  publisher!: string | null;

  @ApiProperty({ nullable: true, type: String })
  imprint!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  startYear!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  totalIssueCount!: number | null;

  @ApiProperty({ nullable: true, type: String })
  language!: string | null;

  @ApiProperty({ nullable: true, type: String })
  ageRating!: string | null;

  @ApiProperty({ enum: COMIC_STATUSES })
  status!: ComicStatus;

  @ApiProperty({
    type: [String],
    description: 'Names of fields overridden by manual edits',
  })
  manualFields!: string[];

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ type: [ComicNamedRefDto] })
  genres!: ComicNamedRefDto[];

  @ApiProperty({ type: [ComicNamedRefDto] })
  tags!: ComicNamedRefDto[];

  @ApiProperty({ type: [ComicCreatorRefDto] })
  creators!: ComicCreatorRefDto[];

  @ApiProperty({ type: [ComicBookListItemDto] })
  books!: ComicBookListItemDto[];

  @ApiProperty({ type: ComicSeriesComicvineDto })
  comicvine!: ComicSeriesComicvineDto;

  @ApiProperty({
    type: [String],
    description: 'Missing issue numbers / ranges within the published run',
  })
  gaps!: string[];

  @ApiProperty({ nullable: true, type: Number })
  publishedTotal!: number | null;

  @ApiProperty({ type: [String] })
  unownedPublished!: string[];

  @ApiProperty({ type: ComicAggregatedTagsDto })
  aggregatedTags!: ComicAggregatedTagsDto;

  @ApiProperty({ type: [ComicNamedRefDto] })
  collections!: ComicNamedRefDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

// ===== BOOK DETAIL =====

export class ComicSuggestedCreatorDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  role!: string;
}

export class ComicBookComicvineDto {
  @ApiProperty()
  linked!: boolean;

  @ApiProperty({ nullable: true, type: Number })
  issueId!: number | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String })
  issueNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  siteDetailUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  imageUrl!: string | null;

  @ApiProperty({ type: [ComicSuggestedCreatorDto] })
  suggestedCreators!: ComicSuggestedCreatorDto[];
}

export class ComicBookMetadataTagsDto {
  @ApiProperty({ type: [String] })
  storyArcs!: string[];

  @ApiProperty({ type: [String] })
  characters!: string[];

  @ApiProperty({ type: [String] })
  teams!: string[];

  @ApiProperty({ type: [String] })
  locations!: string[];
}

export class ComicBookSeriesRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;
}

/**
 * Book detail extends the list-item shape but re-declares the four
 * priority-merged fields (title, number, coverDate, summary) because
 * `resolveFieldByPriority` can return null for any of them.
 */
export class ComicBookDetailDto extends ComicBookListItemDto {
  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date',
    description: 'YYYY-MM-DD',
  })
  storeDate!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Names of fields overridden by manual edits',
  })
  manualFields!: string[];

  @ApiProperty({ nullable: true, type: String })
  web!: string | null;

  @ApiProperty({ nullable: true, type: String })
  ageRating!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  issueCountFromFile!: number | null;

  @ApiProperty({ type: ComicBookMetadataTagsDto })
  metadataTags!: ComicBookMetadataTagsDto;

  @ApiProperty({ type: ComicBookSeriesRefDto })
  series!: ComicBookSeriesRefDto;

  @ApiProperty({ type: [ComicBookCreatorRefDto] })
  creators!: ComicBookCreatorRefDto[];

  @ApiProperty({ type: ComicBookComicvineDto })
  comicvine!: ComicBookComicvineDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

// ===== COLLECTIONS =====

export class ComicCollectionListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  seriesCount!: number;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class ComicCollectionListResponseDto {
  @ApiProperty({ type: [ComicCollectionListItemDto] })
  collections!: ComicCollectionListItemDto[];

  @ApiProperty()
  total!: number;
}

/**
 * Series entry as embedded in a collection detail. It mirrors the series list
 * item minus a couple of fields (no createdAt is emitted with a Date type from
 * findOne — it uses the series row's createdAt) — see field list below.
 */
export class ComicCollectionSeriesItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  publisher!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  startYear!: number | null;

  @ApiProperty({ enum: COMIC_STATUSES })
  status!: ComicStatus;

  @ApiProperty()
  bookCount!: number;

  @ApiProperty({ nullable: true, type: Number })
  totalIssueCount!: number | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty()
  comicvineLinked!: boolean;
}

export class ComicCollectionDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  sortName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ type: [ComicCollectionSeriesItemDto] })
  series!: ComicCollectionSeriesItemDto[];
}

// ===== SMALL OPERATION RESULTS =====

export class ComicIdResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class ComicSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class ComicMoveResultDto {
  @ApiProperty({ description: 'Number of books actually moved' })
  moved!: number;

  @ApiProperty({
    type: [String],
    description: 'Ids of source series deleted because they became empty',
  })
  deletedSeriesIds!: string[];
}

export class ComicBatchUpdateResultDto {
  @ApiProperty({ description: 'Number of books updated' })
  updated!: number;
}

export class ComicCoverUpdateResponseDto {
  @ApiProperty({ description: 'Raw stored cover filename' })
  coverUrl!: string;
}
