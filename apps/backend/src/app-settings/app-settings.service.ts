// apps/backend/src/app-settings/app-settings.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as authSchema from '../auth/schema';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_METADATA_PRIORITY,
  DEFAULT_COMIC_METADATA_PRIORITY,
  MetadataFieldPriority,
  ComicMetadataFieldPriority,
} from './schema';
import { AppEventsService } from '../events/app-events.service';

/**
 * A stored priority map is whatever a client last PATCHed, and `PATCH /settings`
 * replaces the column wholesale — so a caller that sends only `{ title, author }`
 * leaves every other field without a priority list. Reading that back unguarded
 * hands `undefined` to resolveFieldByPriority, which 500s every endpoint that
 * resolves metadata. Fill the gaps from the defaults on read, per field, so a
 * partial write degrades to "default order for the fields you omitted" and rows
 * already written that way heal themselves.
 */
function mergeFieldPriority<T extends object>(
  stored: T | null | undefined,
  defaults: T,
): T {
  if (!stored || typeof stored !== 'object') return defaults;

  const storedFields = stored as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...(defaults as object) } as Record<
    string,
    unknown
  >;
  for (const key of Object.keys(defaults)) {
    const value = storedFields[key];
    if (Array.isArray(value) && value.length > 0) merged[key] = value;
  }
  return merged as T;
}

@Injectable()
export class AppSettingsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
    private appEvents: AppEventsService,
  ) {}

  async getSettings() {
    const settings = await this.db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.id, 'app_settings'))
      .limit(1);

    if (settings.length === 0) {
      const [newSettings] = await this.db
        .insert(schema.appSettings)
        .values({ id: 'app_settings' })
        .returning();
      return newSettings;
    }

    return settings[0];
  }

  async updateSettings(updates: {
    signupsEnabled?: boolean;
    audiobookLibraryPath?: string | null;
    ebookLibraryPath?: string | null;
    comicLibraryPath?: string | null;
    watcherEnabled?: boolean;
    metadataPriority?: MetadataFieldPriority;
    comicMetadataPriority?: ComicMetadataFieldPriority;
    ttsEnabled?: boolean;
    ttsBaseUrl?: string | null;
    ttsApiKey?: string | null;
    ttsVoice?: string;
    ttsSpeed?: number;
    ttsModel?: string;
    opdsEnabled?: boolean;
    oidcButtonText?: string;
    emailPasswordEnabled?: boolean;
    oidcAutoCreateUsers?: string;
    requestsEnabled?: boolean;
    requestsAudiobookCategory?: string;
    requestsEbookCategory?: string;
    requestsComicsCategory?: string;
    autoApproveRequestsPerWeek?: number;
    requestsUseFreeleech?: boolean;
    defaultCanEditMetadata?: boolean;
    defaultCanUpload?: boolean;
    defaultCanDelete?: boolean;
    defaultCanGenerateApiKeys?: boolean;
    defaultCanRequestContent?: boolean;
    defaultCanGenerateAudiobooks?: boolean;
    backupEnabled?: boolean;
    backupPath?: string | null;
    backupSchedule?: string;
    backupsToKeep?: number;
  }) {
    const [updated] = await this.db
      .update(schema.appSettings)
      .set(updates)
      .where(eq(schema.appSettings.id, 'app_settings'))
      .returning();

    if (!updated) {
      const [newSettings] = await this.db
        .insert(schema.appSettings)
        .values({ id: 'app_settings', ...updates })
        .returning();
      this.appEvents.settingsUpdated();
      return newSettings;
    }

    this.appEvents.settingsUpdated();
    return updated;
  }

  async isSignupEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.signupsEnabled;
  }

  async getAudiobookLibraryPath(): Promise<string | null> {
    const settings = await this.getSettings();
    return settings.audiobookLibraryPath;
  }

  async getEbookLibraryPath(): Promise<string | null> {
    const settings = await this.getSettings();
    return settings.ebookLibraryPath;
  }

  async getComicLibraryPath(): Promise<string | null> {
    const settings = await this.getSettings();
    return settings.comicLibraryPath;
  }

  async isWatcherEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.watcherEnabled;
  }

  async getMetadataPriority(): Promise<MetadataFieldPriority> {
    const settings = await this.getSettings();
    return mergeFieldPriority(
      settings.metadataPriority,
      DEFAULT_METADATA_PRIORITY,
    );
  }

  async isOpdsEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.opdsEnabled;
  }

  async getOidcButtonText(): Promise<string> {
    const settings = await this.getSettings();
    return settings.oidcButtonText;
  }

  async isEmailPasswordEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.emailPasswordEnabled;
  }

  async getOidcAutoCreateUsers(): Promise<string> {
    const settings = await this.getSettings();
    return settings.oidcAutoCreateUsers;
  }

  async isRequestsEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.requestsEnabled;
  }

  async getRequestsCategories(): Promise<{
    audiobook: string;
    ebook: string;
    comics: string;
  }> {
    const settings = await this.getSettings();
    return {
      audiobook: settings.requestsAudiobookCategory,
      ebook: settings.requestsEbookCategory,
      comics: settings.requestsComicsCategory,
    };
  }

  async getDefaultUserPermissions(): Promise<{
    canEditMetadata: boolean;
    canUpload: boolean;
    canDelete: boolean;
    canGenerateApiKeys: boolean;
    canRequestContent: boolean;
    canGenerateAudiobooks: boolean;
  }> {
    const settings = await this.getSettings();
    return {
      canEditMetadata: settings.defaultCanEditMetadata,
      canUpload: settings.defaultCanUpload,
      canDelete: settings.defaultCanDelete,
      canGenerateApiKeys: settings.defaultCanGenerateApiKeys,
      canRequestContent: settings.defaultCanRequestContent,
      canGenerateAudiobooks: settings.defaultCanGenerateAudiobooks,
    };
  }

  async isSetupCompleted(): Promise<boolean> {
    const users = await this.db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .limit(1);
    return users.length > 0;
  }

  async getComicMetadataPriority(): Promise<ComicMetadataFieldPriority> {
    const settings = await this.getSettings();
    return mergeFieldPriority(
      settings.comicMetadataPriority,
      DEFAULT_COMIC_METADATA_PRIORITY,
    );
  }

  async getTtsConfig(): Promise<{
    enabled: boolean;
    baseUrl: string | null;
    apiKey: string | null;
    voice: string;
    speed: number;
    model: string;
  }> {
    const settings = await this.getSettings();
    return {
      enabled: settings.ttsEnabled,
      baseUrl: settings.ttsBaseUrl,
      apiKey: settings.ttsApiKey,
      voice: settings.ttsVoice,
      speed: settings.ttsSpeed,
      model: settings.ttsModel,
    };
  }
}
