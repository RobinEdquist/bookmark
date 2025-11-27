// apps/backend/src/app-settings/app-settings.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_METADATA_PRIORITY, MetadataFieldPriority } from './schema';

@Injectable()
export class AppSettingsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
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
    libraryPath?: string;
    watcherEnabled?: boolean;
    metadataPriority?: MetadataFieldPriority;
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
      return newSettings;
    }

    return updated;
  }

  async isSignupEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.signupsEnabled;
  }

  async getLibraryPath(): Promise<string | null> {
    const settings = await this.getSettings();
    return settings.libraryPath;
  }

  async isWatcherEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.watcherEnabled;
  }

  async getMetadataPriority(): Promise<MetadataFieldPriority> {
    const settings = await this.getSettings();
    return settings.metadataPriority || DEFAULT_METADATA_PRIORITY;
  }
}
