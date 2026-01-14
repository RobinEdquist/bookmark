import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('announcements_is_active_idx').on(table.isActive),
    index('announcements_created_at_idx').on(table.createdAt),
  ],
);

export const announcementDismissals = pgTable(
  'announcement_dismissals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at').defaultNow().notNull(),
  },
  (table) => [
    index('announcement_dismissals_user_idx').on(table.userId),
    index('announcement_dismissals_announcement_idx').on(table.announcementId),
  ],
);

export const announcementsRelations = relations(
  announcements,
  ({ one, many }) => ({
    creator: one(user, {
      fields: [announcements.createdBy],
      references: [user.id],
    }),
    dismissals: many(announcementDismissals),
  }),
);

export const announcementDismissalsRelations = relations(
  announcementDismissals,
  ({ one }) => ({
    announcement: one(announcements, {
      fields: [announcementDismissals.announcementId],
      references: [announcements.id],
    }),
    user: one(user, {
      fields: [announcementDismissals.userId],
      references: [user.id],
    }),
  }),
);
