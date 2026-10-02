import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  primaryKey,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';

export const requestStatus = [
  'pending',
  'approved',
  'waiting',
  'downloading',
  'complete',
  'rejected',
] as const;
export type RequestStatus = (typeof requestStatus)[number];

export const contentType = ['audiobook', 'ebook', 'comics'] as const;
export type ContentType = (typeof contentType)[number];

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<RequestStatus>().notNull().default('pending'),
    // Book intent survives changes to the selected release. Legacy transfer
    // columns remain as a projection for existing API/import consumers.
    bookKey: text('book_key').notNull(),
    languageKey: text('language_key').notNull().default('any'),
    languageNames: text('language_names').array().notNull().default([]),
    languageIds: integer('language_ids').array().notNull().default([]),
    languageModule: text('language_module'),
    approvedAt: timestamp('approved_at'),
    lastSearchAt: timestamp('last_search_at'),
    nextSearchAt: timestamp('next_search_at'),
    searchFailures: integer('search_failures').notNull().default(0),
    searchError: text('search_error'),
    searchClaim: uuid('search_claim'),
    searchLeaseUntil: timestamp('search_lease_until'),
    releaseDate: timestamp('release_date'),
    candidateModule: text('candidate_module'),
    torrentId: text('torrent_id'),
    torrentHash: text('torrent_hash'),
    folderName: text('folder_name'),
    title: text('title').notNull(),
    author: text('author'),
    narrator: text('narrator'),
    series: text('series'),
    description: text('description'),
    coverUrl: text('cover_url'),
    contentType: text('content_type').$type<ContentType>().notNull(),
    categoryId: integer('category_id'),
    rejectionReason: text('rejection_reason'),
    // Set the first time the download client reports the torrent as unknown, so
    // admins can find requests whose download vanished. Cleared if it reappears.
    torrentMissingSince: timestamp('torrent_missing_since'),
    libraryItemId: uuid('library_item_id'),
    libraryItemType: text('library_item_type').$type<ContentType>(),
    autoApprovedByUserId: text('auto_approved_by_user_id').references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('requests_book_intent_idx').on(
      table.bookKey,
      table.contentType,
      table.languageKey,
    ),
    index('requests_search_due_idx').on(table.nextSearchAt),
    index('requests_status_idx').on(table.status),
    index('requests_user_id_idx').on(table.userId),
    index('requests_folder_name_idx').on(table.folderName),
    index('requests_torrent_id_idx').on(table.torrentId),
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

export const requestSupportersRelations = relations(
  requestSupporters,
  ({ one }) => ({
    request: one(requests, {
      fields: [requestSupporters.requestId],
      references: [requests.id],
    }),
    user: one(user, {
      fields: [requestSupporters.userId],
      references: [user.id],
    }),
  }),
);

export const requestAttempts = pgTable(
  'request_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    moduleId: text('module_id').notNull(),
    torrentId: text('torrent_id').notNull(),
    categoryId: integer('category_id'),
    status: text('status')
      .$type<'submitting' | 'tracking' | 'uncertain' | 'failed' | 'complete'>()
      .notNull(),
    torrentHash: text('torrent_hash'),
    folderName: text('folder_name'),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('request_attempts_request_idx').on(table.requestId),
    uniqueIndex('request_attempts_active_idx')
      .on(table.requestId)
      .where(sql`${table.status} IN ('submitting', 'tracking', 'uncertain')`),
  ],
);

// Shared rate limit for scheduled and manually queued searches across replicas.
export const requestSearchSchedule = pgTable('request_search_schedule', {
  id: text('id').primaryKey(),
  nextRunAt: timestamp('next_run_at').notNull(),
});
