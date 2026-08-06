import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { audiobooks } from '../audiobooks/schema';

/**
 * Personal bookmarks: named timestamps a user saves inside an audiobook.
 * Many rows per user+audiobook (no unique constraint by design).
 */
export const audiobookBookmarks = pgTable(
  'audiobook_bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    note: text('note'), // optional; null renders as the formatted timestamp
    position: integer('position').notNull(), // seconds from the start of the audiobook
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('audiobook_bookmarks_user_id_audiobook_id_idx').on(
      table.userId,
      table.audiobookId,
    ),
    index('audiobook_bookmarks_audiobook_id_idx').on(table.audiobookId),
    index('audiobook_bookmarks_user_id_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const audiobookBookmarksRelations = relations(
  audiobookBookmarks,
  ({ one }) => ({
    user: one(user, {
      fields: [audiobookBookmarks.userId],
      references: [user.id],
    }),
    audiobook: one(audiobooks, {
      fields: [audiobookBookmarks.audiobookId],
      references: [audiobooks.id],
    }),
  }),
);
