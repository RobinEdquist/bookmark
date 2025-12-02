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

// Re-export for backwards compatibility
export { coverSourceEnum };

// Enums
export const chapterSourceEnum = pgEnum('chapter_source', ['embedded', 'manual', 'external']);
export const audiobookStatusEnum = pgEnum('audiobook_status', [
  'available',
  'missing',
  'importing',
  'hidden',
]);

// Core audiobook table
export const audiobooks = pgTable(
  'audiobooks',
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
    duration: integer('duration'), // seconds, computed from files
    coverUrl: text('cover_url'),
    coverSource: coverSourceEnum('cover_source'),
    filePath: text('file_path').notNull(), // root directory
    isExplicit: boolean('is_explicit').notNull().default(false),
    status: audiobookStatusEnum('status').notNull().default('available'),
    missingAt: timestamp('missing_at'),
    manualFields: jsonb('manual_fields').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('audiobooks_title_idx').on(table.title),
    index('audiobooks_subtitle_idx').on(table.subtitle),
    index('audiobooks_created_at_idx').on(table.createdAt),
    index('audiobooks_language_idx').on(table.language),
    index('audiobooks_status_idx').on(table.status),
  ],
);

// Audio files for each audiobook
export const audiobookFiles = pgTable(
  'audiobook_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    order: integer('order').notNull(),
    duration: integer('duration').notNull(), // seconds
    format: text('format').notNull(), // mp3, m4b, m4a, ogg
    bitrate: integer('bitrate'),
    sampleRate: integer('sample_rate'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audiobook_files_audiobook_id_idx').on(table.audiobookId)],
);

// Chapters
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startTime: integer('start_time').notNull(), // seconds from audiobook start
    endTime: integer('end_time'), // nullable, inferred from next chapter
    order: integer('order').notNull(),
    source: chapterSourceEnum('source').notNull().default('embedded'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('chapters_audiobook_id_idx').on(table.audiobookId)],
);

// People (authors and narrators unified)
export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    bio: text('bio'),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('people_name_idx').on(table.name)],
);

// Junction: audiobook authors
export const audiobookAuthors = pgTable(
  'audiobook_authors',
  {
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.audiobookId, table.personId] }),
    index('audiobook_authors_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_authors_person_id_idx').on(table.personId),
  ],
);

// Junction: audiobook narrators
export const audiobookNarrators = pgTable(
  'audiobook_narrators',
  {
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.audiobookId, table.personId] }),
    index('audiobook_narrators_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_narrators_person_id_idx').on(table.personId),
  ],
);

// Series
export const series = pgTable(
  'series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('series_name_idx').on(table.name)],
);

// Junction: audiobook series (multi-series support)
export const audiobookSeries = pgTable(
  'audiobook_series',
  {
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    order: numeric('order', { precision: 5, scale: 1 }).notNull(), // e.g., 1.0, 1.5, 2.0
  },
  (table) => [
    primaryKey({ columns: [table.audiobookId, table.seriesId] }),
    index('audiobook_series_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_series_series_id_idx').on(table.seriesId),
  ],
);

// Genres (admin-curated)
export const genres = pgTable('genres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Junction: audiobook genres
export const audiobookGenres = pgTable(
  'audiobook_genres',
  {
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.audiobookId, table.genreId] }),
    index('audiobook_genres_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_genres_genre_id_idx').on(table.genreId),
  ],
);

// Tags (user-created)
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Junction: audiobook tags
export const audiobookTags = pgTable(
  'audiobook_tags',
  {
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.audiobookId, table.tagId] }),
    index('audiobook_tags_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_tags_tag_id_idx').on(table.tagId),
  ],
);

// Forward imports for relations (avoids circular dependency)
// The actual tables are defined in their respective schema files
import { hardcoverAudiobookLinks } from '../hardcover/schema';
import { ebookAuthors, ebookSeries } from '../ebooks/schema';

// Relations
export const audiobooksRelations = relations(audiobooks, ({ many, one }) => ({
  files: many(audiobookFiles),
  chapters: many(chapters),
  authors: many(audiobookAuthors),
  narrators: many(audiobookNarrators),
  series: many(audiobookSeries),
  genres: many(audiobookGenres),
  tags: many(audiobookTags),
  hardcoverLink: one(hardcoverAudiobookLinks, {
    fields: [audiobooks.id],
    references: [hardcoverAudiobookLinks.audiobookId],
  }),
}));

export const audiobookFilesRelations = relations(audiobookFiles, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookFiles.audiobookId],
    references: [audiobooks.id],
  }),
}));

export const chaptersRelations = relations(chapters, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [chapters.audiobookId],
    references: [audiobooks.id],
  }),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  authorOf: many(audiobookAuthors),
  narratorOf: many(audiobookNarrators),
  ebookAuthorOf: many(ebookAuthors),
}));

export const audiobookAuthorsRelations = relations(audiobookAuthors, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookAuthors.audiobookId],
    references: [audiobooks.id],
  }),
  person: one(people, {
    fields: [audiobookAuthors.personId],
    references: [people.id],
  }),
}));

export const audiobookNarratorsRelations = relations(audiobookNarrators, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookNarrators.audiobookId],
    references: [audiobooks.id],
  }),
  person: one(people, {
    fields: [audiobookNarrators.personId],
    references: [people.id],
  }),
}));

export const seriesRelations = relations(series, ({ many }) => ({
  audiobooks: many(audiobookSeries),
  ebooks: many(ebookSeries),
}));

export const audiobookSeriesRelations = relations(audiobookSeries, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookSeries.audiobookId],
    references: [audiobooks.id],
  }),
  series: one(series, {
    fields: [audiobookSeries.seriesId],
    references: [series.id],
  }),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  audiobooks: many(audiobookGenres),
}));

export const audiobookGenresRelations = relations(audiobookGenres, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookGenres.audiobookId],
    references: [audiobooks.id],
  }),
  genre: one(genres, {
    fields: [audiobookGenres.genreId],
    references: [genres.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  audiobooks: many(audiobookTags),
}));

export const audiobookTagsRelations = relations(audiobookTags, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [audiobookTags.audiobookId],
    references: [audiobooks.id],
  }),
  tag: one(tags, {
    fields: [audiobookTags.tagId],
    references: [tags.id],
  }),
}));
