// apps/backend/src/app-settings/schema.ts
import {
  pgTable,
  text,
  timestamp,
  boolean,
  check,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type MetadataSource =
  | 'manual'
  | 'embedded'
  | 'hardcover'
  | 'goodreads'
  | 'comicvine'
  | 'filename'
  | 'folder_image';

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
  title: ['manual', 'embedded', 'hardcover', 'goodreads', 'filename'],
  subtitle: ['manual', 'embedded', 'hardcover', 'goodreads'],
  author: ['manual', 'embedded', 'hardcover', 'goodreads', 'filename'],
  narrator: ['manual', 'embedded'],
  description: ['manual', 'embedded', 'hardcover', 'goodreads'],
  publisher: ['manual', 'embedded', 'hardcover', 'goodreads'],
  publishedDate: ['manual', 'embedded', 'hardcover', 'goodreads'],
  language: ['manual', 'embedded'],
  genres: ['manual', 'embedded', 'hardcover', 'goodreads'],
  series: ['manual', 'embedded', 'hardcover', 'goodreads', 'filename'],
  seriesOrder: ['manual', 'embedded', 'hardcover', 'goodreads', 'filename'],
  cover: ['manual', 'embedded', 'hardcover', 'goodreads', 'folder_image'],
};

// Comic-specific metadata field priority (separate from audiobook/ebook priority)
export interface ComicMetadataFieldPriority {
  title: MetadataSource[];
  description: MetadataSource[];
  publisher: MetadataSource[];
  startYear: MetadataSource[];
  genres: MetadataSource[];
  bookTitle: MetadataSource[];
  bookNumber: MetadataSource[];
  bookSummary: MetadataSource[];
  coverDate: MetadataSource[];
}

export const DEFAULT_COMIC_METADATA_PRIORITY: ComicMetadataFieldPriority = {
  title: ['manual', 'embedded', 'comicvine', 'filename'],
  description: ['manual', 'embedded', 'comicvine'],
  publisher: ['manual', 'embedded', 'comicvine'],
  startYear: ['manual', 'embedded', 'comicvine', 'filename'],
  genres: ['manual', 'embedded', 'comicvine'],
  bookTitle: ['manual', 'embedded', 'comicvine'],
  bookNumber: ['manual', 'embedded', 'comicvine', 'filename'],
  bookSummary: ['manual', 'embedded', 'comicvine'],
  coverDate: ['manual', 'embedded', 'comicvine'],
};

export const appSettings = pgTable(
  'app_settings',
  {
    id: text('id').primaryKey().default('app_settings'),
    signupsEnabled: boolean('signups_enabled').notNull().default(true),
    audiobookLibraryPath: text('audiobook_library_path'),
    ebookLibraryPath: text('ebook_library_path'),
    comicLibraryPath: text('comic_library_path'),
    watcherEnabled: boolean('watcher_enabled').notNull().default(true),
    metadataPriority: jsonb('metadata_priority').$type<MetadataFieldPriority>(),
    hardcoverApiKey: text('hardcover_api_key'),
    hardcoverAutoSyncOnImport: boolean('hardcover_auto_sync_on_import')
      .notNull()
      .default(false),
    comicvineApiKey: text('comicvine_api_key'),
    comicvineAutoSyncOnImport: boolean('comicvine_auto_sync_on_import')
      .notNull()
      .default(false),
    comicMetadataPriority: jsonb(
      'comic_metadata_priority',
    ).$type<ComicMetadataFieldPriority>(),
    opdsEnabled: boolean('opds_enabled').notNull().default(false),
    oidcButtonText: text('oidc_button_text')
      .notNull()
      .default('Sign in with SSO'),
    emailPasswordEnabled: boolean('email_password_enabled')
      .notNull()
      .default(true),
    oidcAutoCreateUsers: text('oidc_auto_create_users')
      .notNull()
      .default('auto'),
    requestsEnabled: boolean('requests_enabled').notNull().default(false),
    requestsAudiobookCategory: text('requests_audiobook_category')
      .notNull()
      .default('audiobooks'),
    requestsEbookCategory: text('requests_ebook_category')
      .notNull()
      .default('books'),
    requestsComicsCategory: text('requests_comics_category')
      .notNull()
      .default('comics'),
    autoApproveRequestsPerWeek: integer('auto_approve_requests_per_week')
      .notNull()
      .default(0),
    requestsUseFreeleech: boolean('requests_use_freeleech')
      .notNull()
      .default(false),
    // Default permissions for new users (signup and OIDC)
    defaultCanEditMetadata: boolean('default_can_edit_metadata')
      .notNull()
      .default(false),
    defaultCanUpload: boolean('default_can_upload').notNull().default(false),
    defaultCanDelete: boolean('default_can_delete').notNull().default(false),
    defaultCanGenerateApiKeys: boolean('default_can_generate_api_keys')
      .notNull()
      .default(false),
    defaultCanRequestContent: boolean('default_can_request_content')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check('single_row', sql`${table.id} = 'app_settings'`)],
);
