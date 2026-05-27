import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';

// Goodreads book metadata (standalone, not linked to specific media)
export const goodreadsBooks = pgTable(
  'goodreads_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goodreadsId: text('goodreads_id').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    author: text('author').notNull(),
    description: text('description'),
    coverUrl: text('cover_url'),
    url: text('url').notNull(),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    ratingsCount: integer('ratings_count'),
    genres: jsonb('genres').$type<string[]>().notNull().default([]),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('goodreads_books_goodreads_id_idx').on(table.goodreadsId),
  ],
);

// Junction: audiobook -> goodreads book
export const goodreadsAudiobookLinks = pgTable(
  'goodreads_audiobook_links',
  {
    audiobookId: uuid('audiobook_id')
      .primaryKey()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    goodreadsBookId: uuid('goodreads_book_id')
      .notNull()
      .references(() => goodreadsBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('goodreads_audiobook_links_goodreads_book_id_idx').on(
      table.goodreadsBookId,
    ),
  ],
);

// Junction: ebook -> goodreads book
export const goodreadsEbookLinks = pgTable(
  'goodreads_ebook_links',
  {
    ebookId: uuid('ebook_id')
      .primaryKey()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    goodreadsBookId: uuid('goodreads_book_id')
      .notNull()
      .references(() => goodreadsBooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('goodreads_ebook_links_goodreads_book_id_idx').on(
      table.goodreadsBookId,
    ),
  ],
);

// Relations
export const goodreadsBooksRelations = relations(
  goodreadsBooks,
  ({ many }) => ({
    audiobookLinks: many(goodreadsAudiobookLinks),
    ebookLinks: many(goodreadsEbookLinks),
  }),
);

export const goodreadsAudiobookLinksRelations = relations(
  goodreadsAudiobookLinks,
  ({ one }) => ({
    audiobook: one(audiobooks, {
      fields: [goodreadsAudiobookLinks.audiobookId],
      references: [audiobooks.id],
    }),
    goodreadsBook: one(goodreadsBooks, {
      fields: [goodreadsAudiobookLinks.goodreadsBookId],
      references: [goodreadsBooks.id],
    }),
  }),
);

export const goodreadsEbookLinksRelations = relations(
  goodreadsEbookLinks,
  ({ one }) => ({
    ebook: one(ebooks, {
      fields: [goodreadsEbookLinks.ebookId],
      references: [ebooks.id],
    }),
    goodreadsBook: one(goodreadsBooks, {
      fields: [goodreadsEbookLinks.goodreadsBookId],
      references: [goodreadsBooks.id],
    }),
  }),
);
