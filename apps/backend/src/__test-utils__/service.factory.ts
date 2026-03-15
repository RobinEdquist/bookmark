/**
 * Helpers for bootstrapping NestJS testing modules with common mocks pre-wired.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import type { Type, Provider } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import { AppEventsService } from '../events/app-events.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppDataService } from '../app-data/app-data.service';
import { createMockDb, type MockDb } from './db-mock.factory';

/**
 * A collection of the common mock providers returned by `createServiceTestModule`.
 */
export interface ServiceTestContext<T> {
  module: TestingModule;
  service: T;
  db: MockDb;
  appEvents: jest.Mocked<
    Pick<
      AppEventsService,
      | 'emit'
      | 'audiobookCreated'
      | 'audiobookUpdated'
      | 'audiobookDeleted'
      | 'ebookCreated'
      | 'ebookUpdated'
      | 'ebookDeleted'
      | 'seriesCreated'
      | 'seriesUpdated'
      | 'seriesDeleted'
      | 'settingsUpdated'
      | 'libraryScanStarted'
      | 'libraryScanCompleted'
    >
  >;
  coverService: jest.Mocked<
    Pick<
      CoverService,
      'getCoverUrl' | 'updateCoverFromFile' | 'updateCoverFromUrl'
    >
  >;
  appSettings: jest.Mocked<Pick<AppSettingsService, 'getSettings'>>;
  appData: jest.Mocked<Pick<AppDataService, never>>;
}

function createMockAppEvents() {
  return {
    emit: jest.fn(),
    audiobookCreated: jest.fn(),
    audiobookUpdated: jest.fn(),
    audiobookDeleted: jest.fn(),
    ebookCreated: jest.fn(),
    ebookUpdated: jest.fn(),
    ebookDeleted: jest.fn(),
    seriesCreated: jest.fn(),
    seriesUpdated: jest.fn(),
    seriesDeleted: jest.fn(),
    settingsUpdated: jest.fn(),
    libraryScanStarted: jest.fn(),
    libraryScanCompleted: jest.fn(),
    hardcoverSyncCompleted: jest.fn(),
    subscribe: jest.fn(),
  };
}

function createMockCoverService() {
  return {
    getCoverUrl: jest.fn().mockReturnValue(null),
    updateCoverFromFile: jest
      .fn()
      .mockResolvedValue({ coverUrl: '/api/audiobooks/test/cover' }),
    updateCoverFromUrl: jest
      .fn()
      .mockResolvedValue({ coverUrl: '/api/audiobooks/test/cover' }),
  };
}

function createMockAppSettings() {
  return {
    getSettings: jest.fn().mockResolvedValue({
      id: 'app_settings',
      libraryPath: '/library',
    }),
  };
}

function createMockAppData() {
  return {};
}

/**
 * Create a NestJS testing module with common mocks pre-wired.
 *
 * Provides mock implementations for:
 * - `DATABASE_CONNECTION` (via `createMockDb`)
 * - `AppEventsService`
 * - `CoverService`
 * - `AppSettingsService`
 * - `AppDataService`
 *
 * @param ServiceClass - The service class under test
 * @param extraProviders - Additional providers to register (e.g., other services the target depends on)
 * @returns A `ServiceTestContext` with the compiled module, service instance, and all mocks
 *
 * @example
 * ```ts
 * let ctx: ServiceTestContext<AudiobooksService>;
 *
 * beforeEach(async () => {
 *   ctx = await createServiceTestModule(AudiobooksService, [
 *     { provide: EmbeddedMetadataProvider, useValue: {} },
 *   ]);
 * });
 *
 * it('should work', async () => {
 *   ctx.db.select.mockReturnValue(...);
 *   const result = await ctx.service.findAll();
 * });
 * ```
 */
export async function createServiceTestModule<T>(
  ServiceClass: Type<T>,
  extraProviders: Provider[] = [],
): Promise<ServiceTestContext<T>> {
  const db = createMockDb();
  const appEvents = createMockAppEvents();
  const coverService = createMockCoverService();
  const appSettings = createMockAppSettings();
  const appData = createMockAppData();

  const module = await Test.createTestingModule({
    providers: [
      ServiceClass,
      { provide: DATABASE_CONNECTION, useValue: db },
      { provide: AppEventsService, useValue: appEvents },
      { provide: CoverService, useValue: coverService },
      { provide: AppSettingsService, useValue: appSettings },
      { provide: AppDataService, useValue: appData },
      ...extraProviders,
    ],
  }).compile();

  const service = module.get<T>(ServiceClass);

  return {
    module,
    service,
    db,
    appEvents: appEvents as ServiceTestContext<T>['appEvents'],
    coverService: coverService as ServiceTestContext<T>['coverService'],
    appSettings: appSettings as ServiceTestContext<T>['appSettings'],
    appData: appData as ServiceTestContext<T>['appData'],
  };
}
