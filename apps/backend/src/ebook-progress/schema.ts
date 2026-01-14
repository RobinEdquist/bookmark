import {
  pgTable,
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
import { ebooks } from '../ebooks/schema';

/**
 * Stores the user's current reading position per ebook.
 * Single row per user+ebook combination (upsert on update).
 * Uses CFI (Canonical Fragment Identifier) for precise EPUB location.
 */
export const userEbookProgress = pgTable(
  'user_ebook_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    cfi: text('cfi'), // EPUB CFI like "/6/4[chap01ref]!/4/2/10/2:91"
    progressPercent: integer('progress_percent').notNull().default(0), // 0-100
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
    isHidden: boolean('is_hidden').notNull().default(false), // hidden from "continue reading"
    startedAt: timestamp('started_at').defaultNow().notNull(), // when user first opened
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('user_ebook_progress_unique').on(table.userId, table.ebookId),
    index('user_ebook_progress_user_id_idx').on(table.userId),
    index('user_ebook_progress_ebook_id_idx').on(table.ebookId),
    index('user_ebook_progress_updated_at_idx').on(table.updatedAt),
  ],
);

// Relations
export const userEbookProgressRelations = relations(
  userEbookProgress,
  ({ one }) => ({
    user: one(user, {
      fields: [userEbookProgress.userId],
      references: [user.id],
    }),
    ebook: one(ebooks, {
      fields: [userEbookProgress.ebookId],
      references: [ebooks.id],
    }),
  }),
);
