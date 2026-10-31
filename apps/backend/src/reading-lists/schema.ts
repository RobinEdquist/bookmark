// apps/backend/src/reading-lists/schema.ts
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  uuid,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from '../auth/schema';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';
import { comicBooks } from '../comics/schema';

export const readingListMediaTypeEnum = pgEnum('reading_list_media_type', [
  'audiobook',
  'ebook',
  'comic',
]);

/**
 * An ordered list of items across series, shared across the library: an
 * event's core issues and tie-ins in reading order, or a path through several
 * book series. Each list belongs to one library. Editing needs permission to
 * edit metadata.
 */
export const readingLists = pgTable(
  'reading_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mediaType: readingListMediaTypeEnum('media_type').notNull(),
    name: text('name').notNull(),
    sortName: text('sort_name'),
    description: text('description'),
    // Kept when the user is deleted; the list is shared.
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('reading_lists_media_type_idx').on(table.mediaType),
    index('reading_lists_name_idx').on(table.name),
  ],
);

/**
 * One item in a reading list. Exactly one item column is set, matching the
 * list's media type. An item is in a list at most once. Positions run 0..n-1.
 */
export const readingListEntries = pgTable(
  'reading_list_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    readingListId: uuid('reading_list_id')
      .notNull()
      .references(() => readingLists.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    comicBookId: uuid('comic_book_id').references(() => comicBooks.id, {
      onDelete: 'cascade',
    }),
    audiobookId: uuid('audiobook_id').references(() => audiobooks.id, {
      onDelete: 'cascade',
    }),
    ebookId: uuid('ebook_id').references(() => ebooks.id, {
      onDelete: 'cascade',
    }),
    // A short label such as "Core" or "Tie-in".
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('reading_list_entries_list_position_idx').on(
      table.readingListId,
      table.position,
    ),
    index('reading_list_entries_comic_book_id_idx').on(table.comicBookId),
    index('reading_list_entries_audiobook_id_idx').on(table.audiobookId),
    index('reading_list_entries_ebook_id_idx').on(table.ebookId),
    unique('reading_list_entries_comic_book_unique').on(
      table.readingListId,
      table.comicBookId,
    ),
    unique('reading_list_entries_audiobook_unique').on(
      table.readingListId,
      table.audiobookId,
    ),
    unique('reading_list_entries_ebook_unique').on(
      table.readingListId,
      table.ebookId,
    ),
    check(
      'reading_list_entries_one_item',
      sql`num_nonnulls(${table.comicBookId}, ${table.audiobookId}, ${table.ebookId}) = 1`,
    ),
  ],
);

export const readingListsRelations = relations(readingLists, ({ many }) => ({
  entries: many(readingListEntries),
}));

export const readingListEntriesRelations = relations(
  readingListEntries,
  ({ one }) => ({
    readingList: one(readingLists, {
      fields: [readingListEntries.readingListId],
      references: [readingLists.id],
    }),
    comicBook: one(comicBooks, {
      fields: [readingListEntries.comicBookId],
      references: [comicBooks.id],
    }),
    audiobook: one(audiobooks, {
      fields: [readingListEntries.audiobookId],
      references: [audiobooks.id],
    }),
    ebook: one(ebooks, {
      fields: [readingListEntries.ebookId],
      references: [ebooks.id],
    }),
  }),
);
