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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audiobooks } from '../audiobooks/schema';

// Enum for sync queue status
export const hardcoverSyncStatusEnum = pgEnum('hardcover_sync_status', [
  'pending',
  'processing',
  'failed',
]);

// Hardcover book metadata linked to audiobooks
export const hardcoverBooks = pgTable(
  'hardcover_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .unique()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    hardcoverId: text('hardcover_id').notNull(), // Hardcover's book ID
    slug: text('slug').notNull(), // Hardcover's book slug for URL
    title: text('title').notNull(),
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
    index('hardcover_books_audiobook_id_idx').on(table.audiobookId),
    index('hardcover_books_hardcover_id_idx').on(table.hardcoverId),
  ],
);

export const hardcoverBooksRelations = relations(hardcoverBooks, ({ one }) => ({
  audiobook: one(audiobooks, {
    fields: [hardcoverBooks.audiobookId],
    references: [audiobooks.id],
  }),
}));

// Queue for auto-syncing audiobooks with Hardcover
export const hardcoverSyncQueue = pgTable(
  'hardcover_sync_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .unique()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
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
  ],
);

export const hardcoverSyncQueueRelations = relations(
  hardcoverSyncQueue,
  ({ one }) => ({
    audiobook: one(audiobooks, {
      fields: [hardcoverSyncQueue.audiobookId],
      references: [audiobooks.id],
    }),
  }),
);
