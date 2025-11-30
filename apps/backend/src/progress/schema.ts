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
import { audiobooks } from '../audiobooks/schema';

/**
 * Stores the user's current playback position per audiobook.
 * Single row per user+audiobook combination (upsert on update).
 */
export const userAudiobookProgress = pgTable(
  'user_audiobook_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    currentPosition: integer('current_position').notNull().default(0), // seconds into audiobook
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
    isHidden: boolean('is_hidden').notNull().default(false), // hidden from "continue listening"
    startedAt: timestamp('started_at').defaultNow().notNull(), // when user first played
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('user_audiobook_progress_unique').on(table.userId, table.audiobookId),
    index('user_audiobook_progress_user_id_idx').on(table.userId),
    index('user_audiobook_progress_audiobook_id_idx').on(table.audiobookId),
    index('user_audiobook_progress_updated_at_idx').on(table.updatedAt),
  ],
);

/**
 * Stores completed listening sessions for statistics aggregation.
 * One row per play→pause cycle.
 */
export const listeningSessions = pgTable(
  'listening_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    audiobookId: uuid('audiobook_id')
      .notNull()
      .references(() => audiobooks.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at').notNull(),
    durationSeconds: integer('duration_seconds').notNull(), // actual listening time (excludes pauses)
    startPosition: integer('start_position').notNull(), // where playback started (seconds)
    endPosition: integer('end_position').notNull(), // where playback ended (seconds)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('listening_sessions_user_started_idx').on(table.userId, table.startedAt),
    index('listening_sessions_audiobook_id_idx').on(table.audiobookId),
  ],
);

// Relations
export const userAudiobookProgressRelations = relations(userAudiobookProgress, ({ one }) => ({
  user: one(user, {
    fields: [userAudiobookProgress.userId],
    references: [user.id],
  }),
  audiobook: one(audiobooks, {
    fields: [userAudiobookProgress.audiobookId],
    references: [audiobooks.id],
  }),
}));

export const listeningSessionsRelations = relations(listeningSessions, ({ one }) => ({
  user: one(user, {
    fields: [listeningSessions.userId],
    references: [user.id],
  }),
  audiobook: one(audiobooks, {
    fields: [listeningSessions.audiobookId],
    references: [audiobooks.id],
  }),
}));
