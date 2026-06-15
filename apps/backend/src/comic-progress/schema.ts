import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { comicBooks } from '../comics/schema';

export const comicReadStatusEnum = pgEnum('comic_read_status', [
  'unread',
  'in_progress',
  'finished',
]);

/**
 * Per-user read position for a single comic issue.
 * One row per user+book (upsert). `currentPage` is zero-based.
 */
export const comicBookProgress = pgTable(
  'comic_book_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    comicBookId: uuid('comic_book_id')
      .notNull()
      .references(() => comicBooks.id, { onDelete: 'cascade' }),
    currentPage: integer('current_page').notNull().default(0),
    pageCount: integer('page_count').notNull().default(0),
    status: comicReadStatusEnum('status').notNull().default('in_progress'),
    isHidden: boolean('is_hidden').notNull().default(false),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('comic_book_progress_unique').on(table.userId, table.comicBookId),
    index('comic_book_progress_user_id_idx').on(table.userId),
    index('comic_book_progress_comic_book_id_idx').on(table.comicBookId),
    index('comic_book_progress_user_status_idx').on(table.userId, table.status),
    index('comic_book_progress_updated_at_idx').on(table.updatedAt),
  ],
);

export const comicBookProgressRelations = relations(
  comicBookProgress,
  ({ one }) => ({
    user: one(user, {
      fields: [comicBookProgress.userId],
      references: [user.id],
    }),
    comicBook: one(comicBooks, {
      fields: [comicBookProgress.comicBookId],
      references: [comicBooks.id],
    }),
  }),
);
