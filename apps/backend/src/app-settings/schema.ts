// apps/backend/src/app-settings/schema.ts
import { pgTable, text, timestamp, boolean, check, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type MetadataSource = 'manual' | 'embedded' | 'hardcover' | 'filename' | 'folder_image';

export interface MetadataFieldPriority {
  title: MetadataSource[];
  subtitle: MetadataSource[];
  author: MetadataSource[];
  narrator: MetadataSource[];
  description: MetadataSource[];
  publisher: MetadataSource[];
  publishedDate: MetadataSource[];
  language: MetadataSource[];
  genres: MetadataSource[];
  series: MetadataSource[];
  seriesOrder: MetadataSource[];
  cover: MetadataSource[];
}

export const DEFAULT_METADATA_PRIORITY: MetadataFieldPriority = {
  title: ['manual', 'embedded', 'hardcover', 'filename'],
  subtitle: ['manual', 'embedded', 'hardcover'],
  author: ['manual', 'embedded', 'hardcover', 'filename'],
  narrator: ['manual', 'embedded'],
  description: ['manual', 'embedded', 'hardcover'],
  publisher: ['manual', 'embedded', 'hardcover'],
  publishedDate: ['manual', 'embedded', 'hardcover'],
  language: ['manual', 'embedded'],
  genres: ['manual', 'embedded', 'hardcover'],
  series: ['manual', 'embedded', 'hardcover', 'filename'],
  seriesOrder: ['manual', 'embedded', 'hardcover', 'filename'],
  cover: ['manual', 'embedded', 'hardcover', 'folder_image'],
};

export const appSettings = pgTable(
  'app_settings',
  {
    id: text('id').primaryKey().default('app_settings'),
    signupsEnabled: boolean('signups_enabled').notNull().default(true),
    audiobookLibraryPath: text('audiobook_library_path'),
    ebookLibraryPath: text('ebook_library_path'),
    watcherEnabled: boolean('watcher_enabled').notNull().default(true),
    metadataPriority: jsonb('metadata_priority').$type<MetadataFieldPriority>(),
    hardcoverApiKey: text('hardcover_api_key'),
    hardcoverAutoSyncOnImport: boolean('hardcover_auto_sync_on_import')
      .notNull()
      .default(false),
    opdsEnabled: boolean('opds_enabled').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check('single_row', sql`${table.id} = 'app_settings'`)],
);
