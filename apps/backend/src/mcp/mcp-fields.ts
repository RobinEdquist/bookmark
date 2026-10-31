import { z } from 'zod';
import { comicBookFormatEnum, comicCreatorRoleEnum } from '../comics/schema';
import type { McpMediaType } from './mcp-inspect.service';

export const mediaTypeSchema = z
  .enum(['audiobook', 'ebook', 'comic'])
  .describe('Which library: audiobook, ebook or comic');

/** What a change log row is about. */
export const ENTITY_TYPES = [
  'comic_series',
  'comic_issue',
  'comic_collection',
  'reading_list',
  'audiobook',
  'ebook',
  'book_series',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_NAMES: Record<EntityType, string> = {
  comic_series: 'Comic series',
  comic_issue: 'Comic issue',
  comic_collection: 'Comic collection',
  reading_list: 'Reading list',
  audiobook: 'Audiobook',
  ebook: 'Ebook',
  book_series: 'Series',
};

/** The entity an item-level tool works on for each media type. */
export const ITEM_ENTITY: Record<McpMediaType, EntityType> = {
  comic: 'comic_issue',
  audiobook: 'audiobook',
  ebook: 'ebook',
};

/** The entity a series-level tool works on for each media type. */
export const SERIES_ENTITY: Record<McpMediaType, EntityType> = {
  comic: 'comic_series',
  audiobook: 'book_series',
  ebook: 'book_series',
};

export interface FieldSpec {
  /** The manualFields key; fields without one never lock. */
  lock?: string;
  /** Set when update_item and update_series leave the field to another tool. */
  setBy?: string;
  /** Must not be set to null or an empty string. */
  required?: boolean;
}

/**
 * Every field the write tools can change and undo can restore, named as
 * get_item and get_series name them. Lock keys follow the domain services:
 * books lock `author` and `narrator`, a moved issue locks `seriesId`.
 */
export const FIELDS: Record<EntityType, Record<string, FieldSpec>> = {
  comic_series: {
    title: { lock: 'title', required: true },
    sortTitle: { lock: 'sortTitle' },
    description: { lock: 'description' },
    publisher: { lock: 'publisher' },
    imprint: { lock: 'imprint' },
    startYear: { lock: 'startYear' },
    totalIssueCount: { lock: 'totalIssueCount' },
    language: { lock: 'language' },
    ageRating: { lock: 'ageRating' },
    genres: { lock: 'genres' },
    tags: { lock: 'tags' },
    mainCharacters: { lock: 'mainCharacters', setBy: 'set_main_characters' },
  },
  comic_issue: {
    title: { lock: 'title' },
    number: { lock: 'number' },
    format: { lock: 'format', required: true },
    coverDate: { lock: 'coverDate' },
    summary: { lock: 'summary' },
    collects: { lock: 'collects' },
    ageRating: { lock: 'ageRating' },
    creators: { lock: 'creators' },
    series: { lock: 'seriesId', setBy: 'move_items' },
  },
  audiobook: {
    title: { lock: 'title', required: true },
    subtitle: { lock: 'subtitle' },
    description: { lock: 'description' },
    publisher: { lock: 'publisher' },
    language: { lock: 'language' },
    publishedDate: { lock: 'publishedDate' },
    isbn: { lock: 'isbn' },
    asin: { lock: 'asin' },
    authors: { lock: 'author' },
    narrators: { lock: 'narrator' },
    genres: { lock: 'genres' },
  },
  ebook: {
    title: { lock: 'title', required: true },
    subtitle: { lock: 'subtitle' },
    description: { lock: 'description' },
    publisher: { lock: 'publisher' },
    language: { lock: 'language' },
    publishedDate: { lock: 'publishedDate' },
    isbn: { lock: 'isbn' },
    asin: { lock: 'asin' },
    pageCount: { lock: 'pageCount' },
    authors: { lock: 'author' },
    genres: { lock: 'genres' },
  },
  book_series: {
    name: { required: true },
  },
  comic_collection: {
    name: { required: true },
    sortName: {},
    description: {},
    members: { setBy: 'the collection tools' },
  },
  reading_list: {
    name: { required: true },
    sortName: {},
    description: {},
    entries: { setBy: 'the reading list tools' },
  },
};

/** A field's stored value, and for lockable fields whether it is locked. */
export interface FieldState {
  value: unknown;
  locked?: boolean;
}

/** One row of the change log, before it is written. */
export interface ChangeEntry {
  entityType: EntityType;
  entityId: string;
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Rows that record something undo cannot reverse: a created or deleted
 * record (undoing would mean a delete, or rebuilding by hand) and external
 * links.
 */
export const CREATED_FIELD = 'created';
export const DELETED_FIELD = 'deleted';
export const LINK_FIELD_PREFIX = 'link:';

const text = z.string().nullable().optional();
const names = z.array(z.string().trim().min(1)).max(50).optional();

/** `fields` for update_item. Which ones apply depends on the media type. */
export const itemFieldsSchema = z.strictObject({
  title: text,
  subtitle: text,
  description: text,
  publisher: text,
  language: text,
  publishedDate: text,
  isbn: text,
  asin: text,
  pageCount: z.number().int().min(0).nullable().optional(),
  authors: names.describe('Audiobooks and ebooks, in credit order'),
  narrators: names.describe('Audiobooks'),
  genres: names,
  number: text.describe('Comics: issue number as printed, e.g. "1", "1.5"'),
  format: z.enum(comicBookFormatEnum.enumValues).optional(),
  coverDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  summary: text,
  collects: text.describe('Comics: issues a collected edition reprints'),
  ageRating: text,
  creators: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        role: z.enum(comicCreatorRoleEnum.enumValues),
      }),
    )
    .max(100)
    .optional()
    .describe('Comics: replaces all credits'),
});
export type ItemFields = z.infer<typeof itemFieldsSchema>;

/** `fields` for update_series. */
export const seriesFieldsSchema = z.strictObject({
  title: text,
  sortTitle: text,
  description: text,
  publisher: text,
  imprint: text,
  startYear: z.number().int().min(1800).max(2200).nullable().optional(),
  totalIssueCount: z.number().int().min(0).nullable().optional(),
  language: text,
  ageRating: text,
  genres: names,
  tags: names,
  name: z
    .string()
    .optional()
    .describe('Audiobook and ebook series: the series name'),
});
export type SeriesFields = z.infer<typeof seriesFieldsSchema>;

/** Field names in `FIELDS[type]` the update tools may set. */
export function editableFields(type: EntityType): string[] {
  return Object.entries(FIELDS[type])
    .filter(([, spec]) => !spec.setBy)
    .map(([name]) => name);
}

/**
 * Stored values compare as JSON, with undefined and null the same. Object keys
 * may come in any order: the change log is jsonb, which reorders them.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a ?? null) === canonicalJson(b ?? null);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
        )
      : v,
  );
}
