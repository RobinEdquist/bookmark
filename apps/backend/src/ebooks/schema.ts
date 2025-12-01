import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  date,
  uuid,
  index,
  numeric,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { coverSourceEnum } from '../database/shared-enums';
import { people, series, genres, tags } from '../audiobooks/schema';

// Ebook-specific status enum
export const ebookStatusEnum = pgEnum('ebook_status', [
  'available',
  'missing',
  'importing',
  'hidden',
]);

// Core ebook table
export const ebooks = pgTable(
  'ebooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    publisher: text('publisher'),
    language: text('language'),
    publishedDate: date('published_date'),
    isbn: text('isbn'),
    asin: text('asin'),
    pageCount: integer('page_count'),
    coverUrl: text('cover_url'),
    coverSource: coverSourceEnum('cover_source'),
    filePath: text('file_path').notNull(), // relative to library
    fileName: text('file_name').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    format: text('format').notNull().default('epub'), // epub for now
    isExplicit: boolean('is_explicit').notNull().default(false),
    status: ebookStatusEnum('status').notNull().default('available'),
    missingAt: timestamp('missing_at'),
    manualFields: jsonb('manual_fields').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('ebooks_title_idx').on(table.title),
    index('ebooks_subtitle_idx').on(table.subtitle),
    index('ebooks_created_at_idx').on(table.createdAt),
    index('ebooks_language_idx').on(table.language),
    index('ebooks_status_idx').on(table.status),
  ],
);

// Junction: ebook authors (reuses people table)
export const ebookAuthors = pgTable(
  'ebook_authors',
  {
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.ebookId, table.personId] }),
    index('ebook_authors_ebook_id_idx').on(table.ebookId),
    index('ebook_authors_person_id_idx').on(table.personId),
  ],
);

// Junction: ebook series (reuses series table)
export const ebookSeries = pgTable(
  'ebook_series',
  {
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    order: numeric('order', { precision: 5, scale: 1 }).notNull(), // e.g., 1.0, 1.5, 2.0
  },
  (table) => [
    primaryKey({ columns: [table.ebookId, table.seriesId] }),
    index('ebook_series_ebook_id_idx').on(table.ebookId),
    index('ebook_series_series_id_idx').on(table.seriesId),
  ],
);

// Junction: ebook genres (reuses genres table)
export const ebookGenres = pgTable(
  'ebook_genres',
  {
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.ebookId, table.genreId] }),
    index('ebook_genres_ebook_id_idx').on(table.ebookId),
    index('ebook_genres_genre_id_idx').on(table.genreId),
  ],
);

// Junction: ebook tags (reuses tags table)
export const ebookTags = pgTable(
  'ebook_tags',
  {
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.ebookId, table.tagId] }),
    index('ebook_tags_ebook_id_idx').on(table.ebookId),
    index('ebook_tags_tag_id_idx').on(table.tagId),
  ],
);

// Relations
export const ebooksRelations = relations(ebooks, ({ many }) => ({
  authors: many(ebookAuthors),
  series: many(ebookSeries),
  genres: many(ebookGenres),
  tags: many(ebookTags),
}));

export const ebookAuthorsRelations = relations(ebookAuthors, ({ one }) => ({
  ebook: one(ebooks, {
    fields: [ebookAuthors.ebookId],
    references: [ebooks.id],
  }),
  person: one(people, {
    fields: [ebookAuthors.personId],
    references: [people.id],
  }),
}));

export const ebookSeriesRelations = relations(ebookSeries, ({ one }) => ({
  ebook: one(ebooks, {
    fields: [ebookSeries.ebookId],
    references: [ebooks.id],
  }),
  series: one(series, {
    fields: [ebookSeries.seriesId],
    references: [series.id],
  }),
}));

export const ebookGenresRelations = relations(ebookGenres, ({ one }) => ({
  ebook: one(ebooks, {
    fields: [ebookGenres.ebookId],
    references: [ebooks.id],
  }),
  genre: one(genres, {
    fields: [ebookGenres.genreId],
    references: [genres.id],
  }),
}));

export const ebookTagsRelations = relations(ebookTags, ({ one }) => ({
  ebook: one(ebooks, {
    fields: [ebookTags.ebookId],
    references: [ebooks.id],
  }),
  tag: one(tags, {
    fields: [ebookTags.tagId],
    references: [tags.id],
  }),
}));
