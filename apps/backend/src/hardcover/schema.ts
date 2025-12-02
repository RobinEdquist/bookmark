import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
  jsonb,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';

// Enum for sync queue status
export const hardcoverSyncStatusEnum = pgEnum('hardcover_sync_status', [
  'pending',
  'processing',
  'failed',
]);

// Hardcover book metadata (standalone, not linked to specific media)
export const hardcoverBooks = pgTable(
  'hardcover_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hardcoverId: text('hardcover_id').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    authorNames: jsonb('author_names').$type<string[]>().notNull().default([]),
    contentWarnings: jsonb('content_warnings')
      .$type<string[]>()
      .notNull()
      .default([]),
    featuredSeriesName: text('featured_series_name'),
    featuredSeriesPosition: numeric('featured_series_position', {
      precision: 5,
      scale: 1,
    }),
    genres: jsonb('genres').$type<string[]>().notNull().default([]),
    imageUrl: text('image_url'),
    isbns: jsonb('isbns').$type<string[]>().notNull().default([]),
    moods: jsonb('moods').$type<string[]>().notNull().default([]),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    ratingsCount: integer('ratings_count'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('hardcover_books_hardcover_id_idx').on(table.hardcoverId),
  ],
);

// Junction: audiobook -> hardcover book
export const hardcoverAudiobookLinks = pgTable(
  'hardcover_audiobook_links',
  {
    audiobookId: uuid('audiobook_id')
      .primaryKey()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    hardcoverBookId: uuid('hardcover_book_id')
      .notNull()
      .references(() => hardcoverBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('hardcover_audiobook_links_hardcover_book_id_idx').on(
      table.hardcoverBookId,
    ),
  ],
);

// Junction: ebook -> hardcover book
export const hardcoverEbookLinks = pgTable(
  'hardcover_ebook_links',
  {
    ebookId: uuid('ebook_id')
      .primaryKey()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    hardcoverBookId: uuid('hardcover_book_id')
      .notNull()
      .references(() => hardcoverBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('hardcover_ebook_links_hardcover_book_id_idx').on(
      table.hardcoverBookId,
    ),
  ],
);

// Queue for auto-syncing media with Hardcover
export const hardcoverSyncQueue = pgTable(
  'hardcover_sync_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audiobookId: uuid('audiobook_id').references(() => audiobooks.id, {
      onDelete: 'cascade',
    }),
    ebookId: uuid('ebook_id').references(() => ebooks.id, {
      onDelete: 'cascade',
    }),
    status: hardcoverSyncStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('hardcover_sync_queue_status_idx').on(table.status),
    index('hardcover_sync_queue_created_at_idx').on(table.createdAt),
    index('hardcover_sync_queue_audiobook_id_idx').on(table.audiobookId),
    index('hardcover_sync_queue_ebook_id_idx').on(table.ebookId),
  ],
);

// Relations
export const hardcoverBooksRelations = relations(hardcoverBooks, ({ many }) => ({
  audiobookLinks: many(hardcoverAudiobookLinks),
  ebookLinks: many(hardcoverEbookLinks),
}));

export const hardcoverAudiobookLinksRelations = relations(
  hardcoverAudiobookLinks,
  ({ one }) => ({
    audiobook: one(audiobooks, {
      fields: [hardcoverAudiobookLinks.audiobookId],
      references: [audiobooks.id],
    }),
    hardcoverBook: one(hardcoverBooks, {
      fields: [hardcoverAudiobookLinks.hardcoverBookId],
      references: [hardcoverBooks.id],
    }),
  }),
);

export const hardcoverEbookLinksRelations = relations(
  hardcoverEbookLinks,
  ({ one }) => ({
    ebook: one(ebooks, {
      fields: [hardcoverEbookLinks.ebookId],
      references: [ebooks.id],
    }),
    hardcoverBook: one(hardcoverBooks, {
      fields: [hardcoverEbookLinks.hardcoverBookId],
      references: [hardcoverBooks.id],
    }),
  }),
);

export const hardcoverSyncQueueRelations = relations(
  hardcoverSyncQueue,
  ({ one }) => ({
    audiobook: one(audiobooks, {
      fields: [hardcoverSyncQueue.audiobookId],
      references: [audiobooks.id],
    }),
    ebook: one(ebooks, {
      fields: [hardcoverSyncQueue.ebookId],
      references: [ebooks.id],
    }),
  }),
);
