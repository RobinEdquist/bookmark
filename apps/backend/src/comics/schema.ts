// apps/backend/src/comics/schema.ts
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
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
import { people, genres, tags } from '../audiobooks/schema';

export const comicSeriesStatusEnum = pgEnum('comic_series_status', [
  'available',
  'missing',
  'importing',
  'hidden',
]);

export const comicBookStatusEnum = pgEnum('comic_book_status', [
  'available',
  'missing',
  'importing',
  'hidden',
]);

export const comicBookFormatEnum = pgEnum('comic_book_format', [
  'single_issue',
  'annual',
  'tpb',
  'omnibus',
  'one_shot',
  'special',
  'graphic_novel',
  'other',
]);

export const comicContainerEnum = pgEnum('comic_container', [
  'cbz',
  'cbr',
  'pdf',
]);

export const comicCreatorRoleEnum = pgEnum('comic_creator_role', [
  'writer',
  'penciller',
  'inker',
  'colorist',
  'letterer',
  'cover_artist',
  'editor',
  'other',
]);

export const comicSeries = pgTable(
  'comic_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sortTitle: text('sort_title'),
    description: text('description'),
    publisher: text('publisher'),
    imprint: text('imprint'),
    startYear: integer('start_year'),
    totalIssueCount: integer('total_issue_count'),
    language: text('language'),
    ageRating: text('age_rating'),
    coverUrl: text('cover_url'),
    coverSource: coverSourceEnum('cover_source'),
    // Relative path to the series folder inside the comic library.
    // For root-level one-shot files this is the relative FILE path instead.
    folderPath: text('folder_path').notNull().unique(),
    status: comicSeriesStatusEnum('status').notNull().default('available'),
    missingAt: timestamp('missing_at'),
    manualFields: jsonb('manual_fields').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('comic_series_title_idx').on(table.title),
    index('comic_series_sort_title_idx').on(table.sortTitle),
    index('comic_series_publisher_idx').on(table.publisher),
    index('comic_series_start_year_idx').on(table.startYear),
    index('comic_series_status_idx').on(table.status),
    index('comic_series_created_at_idx').on(table.createdAt),
  ],
);

export const comicBooks = pgTable(
  'comic_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => comicSeries.id, { onDelete: 'cascade' }),
    title: text('title'),
    // Display designation: "1", "1.5", "1AU", "Annual 1", "4" (for Vol. 4)
    number: text('number'),
    // Parsed numeric for ordering; null sorts last
    sortNumber: numeric('sort_number', { precision: 8, scale: 2 }),
    format: comicBookFormatEnum('format').notNull().default('single_issue'),
    coverDate: date('cover_date'),
    storeDate: date('store_date'),
    summary: text('summary'),
    pageCount: integer('page_count'),
    // Relative to comic library root
    filePath: text('file_path').notNull().unique(),
    fileName: text('file_name').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    container: comicContainerEnum('container').notNull(),
    coverUrl: text('cover_url'),
    coverSource: coverSourceEnum('cover_source'),
    status: comicBookStatusEnum('status').notNull().default('available'),
    missingAt: timestamp('missing_at'),
    manualFields: jsonb('manual_fields').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('comic_books_series_id_idx').on(table.seriesId),
    index('comic_books_title_idx').on(table.title),
    index('comic_books_sort_number_idx').on(table.sortNumber),
    index('comic_books_cover_date_idx').on(table.coverDate),
    index('comic_books_status_idx').on(table.status),
    index('comic_books_created_at_idx').on(table.createdAt),
  ],
);

export const comicBookCreators = pgTable(
  'comic_book_creators',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => comicBooks.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: comicCreatorRoleEnum('role').notNull(),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.bookId, table.personId, table.role] }),
    index('comic_book_creators_book_id_idx').on(table.bookId),
    index('comic_book_creators_person_id_idx').on(table.personId),
  ],
);

export const comicSeriesGenres = pgTable(
  'comic_series_genres',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => comicSeries.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.seriesId, table.genreId] }),
    index('comic_series_genres_series_id_idx').on(table.seriesId),
    index('comic_series_genres_genre_id_idx').on(table.genreId),
  ],
);

export const comicSeriesTags = pgTable(
  'comic_series_tags',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => comicSeries.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.seriesId, table.tagId] }),
    index('comic_series_tags_series_id_idx').on(table.seriesId),
    index('comic_series_tags_tag_id_idx').on(table.tagId),
  ],
);

export const comicSeriesRelations = relations(comicSeries, ({ many }) => ({
  books: many(comicBooks),
  genres: many(comicSeriesGenres),
  tags: many(comicSeriesTags),
}));

export const comicBooksRelations = relations(comicBooks, ({ one, many }) => ({
  series: one(comicSeries, {
    fields: [comicBooks.seriesId],
    references: [comicSeries.id],
  }),
  creators: many(comicBookCreators),
}));

export const comicBookCreatorsRelations = relations(
  comicBookCreators,
  ({ one }) => ({
    book: one(comicBooks, {
      fields: [comicBookCreators.bookId],
      references: [comicBooks.id],
    }),
    person: one(people, {
      fields: [comicBookCreators.personId],
      references: [people.id],
    }),
  }),
);

export const comicSeriesGenresRelations = relations(
  comicSeriesGenres,
  ({ one }) => ({
    series: one(comicSeries, {
      fields: [comicSeriesGenres.seriesId],
      references: [comicSeries.id],
    }),
    genre: one(genres, {
      fields: [comicSeriesGenres.genreId],
      references: [genres.id],
    }),
  }),
);

export const comicSeriesTagsRelations = relations(
  comicSeriesTags,
  ({ one }) => ({
    series: one(comicSeries, {
      fields: [comicSeriesTags.seriesId],
      references: [comicSeries.id],
    }),
    tag: one(tags, {
      fields: [comicSeriesTags.tagId],
      references: [tags.id],
    }),
  }),
);
