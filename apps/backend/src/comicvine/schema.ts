import {
  pgTable,
  pgEnum,
  text,
  integer,
  jsonb,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { comicSeries, comicBooks } from '../comics/schema';

export const comicvineSyncStatusEnum = pgEnum('comicvine_sync_status', [
  'pending',
  'processing',
  'failed',
  'needs_review',
]);
export const comicvineMatchLevelEnum = pgEnum('comicvine_match_level', [
  'series',
  'book',
]);

// Cache: ComicVine volumes (maps to a comic SERIES)
export const comicvineVolumes = pgTable(
  'comicvine_volumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    comicvineVolumeId: integer('comicvine_volume_id').notNull(),
    name: text('name').notNull(),
    startYear: integer('start_year'),
    publisherName: text('publisher_name'),
    countOfIssues: integer('count_of_issues'),
    description: text('description'),
    imageUrl: text('image_url'),
    siteDetailUrl: text('site_detail_url'),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex('comicvine_volumes_cvid_idx').on(t.comicvineVolumeId)],
);

// Cache: ComicVine issues (maps to a comic BOOK)
export const comicvineIssues = pgTable(
  'comicvine_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    comicvineIssueId: integer('comicvine_issue_id').notNull(),
    comicvineVolumeId: integer('comicvine_volume_id'),
    issueNumber: text('issue_number'),
    name: text('name'),
    coverDate: date('cover_date'),
    storeDate: date('store_date'),
    description: text('description'),
    imageUrl: text('image_url'),
    siteDetailUrl: text('site_detail_url'),
    personCredits: jsonb('person_credits')
      .$type<{ name: string; role: string }[]>()
      .default([]),
    characterCredits: jsonb('character_credits').$type<string[]>().default([]),
    storyArcCredits: jsonb('story_arc_credits').$type<string[]>().default([]),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex('comicvine_issues_cvid_idx').on(t.comicvineIssueId),
    index('comicvine_issues_volume_idx').on(t.comicvineVolumeId),
  ],
);

// Link: comic_series <-> comicvine_volumes (one-to-one on series)
export const comicvineVolumeLinks = pgTable(
  'comicvine_volume_links',
  {
    seriesId: uuid('series_id')
      .primaryKey()
      .references(() => comicSeries.id, { onDelete: 'cascade' }),
    comicvineVolumeRowId: uuid('comicvine_volume_row_id')
      .notNull()
      .references(() => comicvineVolumes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('comicvine_volume_links_vol_idx').on(t.comicvineVolumeRowId)],
);

// Link: comic_books <-> comicvine_issues (one-to-one on book)
export const comicvineIssueLinks = pgTable(
  'comicvine_issue_links',
  {
    bookId: uuid('book_id')
      .primaryKey()
      .references(() => comicBooks.id, { onDelete: 'cascade' }),
    comicvineIssueRowId: uuid('comicvine_issue_row_id')
      .notNull()
      .references(() => comicvineIssues.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('comicvine_issue_links_issue_idx').on(t.comicvineIssueRowId)],
);

// Async match/sync queue
export const comicvineSyncQueue = pgTable(
  'comicvine_sync_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    level: comicvineMatchLevelEnum('level').notNull(),
    seriesId: uuid('series_id').references(() => comicSeries.id, {
      onDelete: 'cascade',
    }),
    bookId: uuid('book_id').references(() => comicBooks.id, {
      onDelete: 'cascade',
    }),
    status: comicvineSyncStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('comicvine_sync_queue_status_idx').on(t.status),
    index('comicvine_sync_queue_created_idx').on(t.createdAt),
    index('comicvine_sync_queue_series_idx').on(t.seriesId),
    index('comicvine_sync_queue_book_idx').on(t.bookId),
  ],
);

export const comicvineVolumesRelations = relations(
  comicvineVolumes,
  ({ many }) => ({
    links: many(comicvineVolumeLinks),
  }),
);
export const comicvineIssuesRelations = relations(
  comicvineIssues,
  ({ many }) => ({
    links: many(comicvineIssueLinks),
  }),
);
export const comicvineVolumeLinksRelations = relations(
  comicvineVolumeLinks,
  ({ one }) => ({
    series: one(comicSeries, {
      fields: [comicvineVolumeLinks.seriesId],
      references: [comicSeries.id],
    }),
    volume: one(comicvineVolumes, {
      fields: [comicvineVolumeLinks.comicvineVolumeRowId],
      references: [comicvineVolumes.id],
    }),
  }),
);
export const comicvineIssueLinksRelations = relations(
  comicvineIssueLinks,
  ({ one }) => ({
    book: one(comicBooks, {
      fields: [comicvineIssueLinks.bookId],
      references: [comicBooks.id],
    }),
    issue: one(comicvineIssues, {
      fields: [comicvineIssueLinks.comicvineIssueRowId],
      references: [comicvineIssues.id],
    }),
  }),
);
