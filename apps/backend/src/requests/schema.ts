import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';

export const requestStatus = ['pending', 'approved', 'downloading', 'complete', 'rejected'] as const;
export type RequestStatus = (typeof requestStatus)[number];

export const contentType = ['audiobook', 'ebook'] as const;
export type ContentType = (typeof contentType)[number];

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<RequestStatus>().notNull().default('pending'),
    mamTorrentId: text('mam_torrent_id').notNull(),
    torrentHash: text('torrent_hash'),
    folderName: text('folder_name'),
    title: text('title').notNull(),
    author: text('author'),
    narrator: text('narrator'),
    series: text('series'),
    description: text('description'),
    coverUrl: text('cover_url'),
    contentType: text('content_type').$type<ContentType>().notNull(),
    rejectionReason: text('rejection_reason'),
    libraryItemId: uuid('library_item_id'),
    libraryItemType: text('library_item_type').$type<ContentType>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('requests_status_idx').on(table.status),
    index('requests_user_id_idx').on(table.userId),
    index('requests_folder_name_idx').on(table.folderName),
    index('requests_mam_torrent_id_idx').on(table.mamTorrentId),
  ],
);

export const requestSupporters = pgTable(
  'request_supporters',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.userId] }),
    index('request_supporters_request_id_idx').on(table.requestId),
  ],
);

export const requestsRelations = relations(requests, ({ one, many }) => ({
  user: one(user, {
    fields: [requests.userId],
    references: [user.id],
  }),
  supporters: many(requestSupporters),
  audiobook: one(audiobooks, {
    fields: [requests.libraryItemId],
    references: [audiobooks.id],
  }),
  ebook: one(ebooks, {
    fields: [requests.libraryItemId],
    references: [ebooks.id],
  }),
}));

export const requestSupportersRelations = relations(requestSupporters, ({ one }) => ({
  request: one(requests, {
    fields: [requestSupporters.requestId],
    references: [requests.id],
  }),
  user: one(user, {
    fields: [requestSupporters.userId],
    references: [user.id],
  }),
}));
