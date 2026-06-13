import { AppSettingsService } from './app-settings.service';
import {
  DEFAULT_METADATA_PRIORITY,
  DEFAULT_COMIC_METADATA_PRIORITY,
} from './schema';
import * as schema from './schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'returning',
    'set',
    'values',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

function createMockAppEvents() {
  return {
    settingsUpdated: jest.fn(),
  } as any;
}

function buildDefaultSettings(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'app_settings',
    signupsEnabled: true,
    audiobookLibraryPath: null,
    ebookLibraryPath: null,
    watcherEnabled: true,
    metadataPriority: null,
    opdsEnabled: false,
    oidcButtonText: 'Sign in with SSO',
    emailPasswordEnabled: true,
    oidcAutoCreateUsers: 'auto',
    requestsEnabled: false,
    requestsAudiobookCategory: 'audiobooks',
    requestsEbookCategory: 'books',
    requestsComicsCategory: 'comics',
    autoApproveRequestsPerWeek: 0,
    requestsUseFreeleech: false,
    defaultCanEditMetadata: false,
    defaultCanUpload: false,
    defaultCanDelete: false,
    defaultCanGenerateApiKeys: false,
    defaultCanRequestContent: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppSettingsService', () => {
  // -----------------------------------------------------------------------
  // getSettings
  // -----------------------------------------------------------------------
  describe('getSettings', () => {
    it('returns existing settings when they exist', async () => {
      const settings = buildDefaultSettings();
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getSettings();

      expect(result).toEqual(settings);
      expect(db.select).toHaveBeenCalled();
    });

    it('creates default settings when none exist', async () => {
      const newSettings = buildDefaultSettings();
      const selectChain = chainMock([]);
      const insertChain = chainMock([newSettings]);

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn().mockReturnValue(insertChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getSettings();

      expect(db.insert).toHaveBeenCalledWith(schema.appSettings);
      expect(insertChain.values).toHaveBeenCalledWith({ id: 'app_settings' });
      expect(result).toEqual(newSettings);
    });
  });

  // -----------------------------------------------------------------------
  // updateSettings
  // -----------------------------------------------------------------------
  describe('updateSettings', () => {
    it('updates existing settings and emits event', async () => {
      const updated = buildDefaultSettings({ signupsEnabled: false });
      const updateChain = chainMock([updated]);
      const appEvents = createMockAppEvents();
      const db = createMockDb({
        update: jest.fn().mockReturnValue(updateChain),
      });
      const service = new AppSettingsService(db, appEvents);

      const result = await service.updateSettings({ signupsEnabled: false });

      expect(db.update).toHaveBeenCalledWith(schema.appSettings);
      expect(updateChain.set).toHaveBeenCalledWith({ signupsEnabled: false });
      expect(result).toEqual(updated);
      expect(appEvents.settingsUpdated).toHaveBeenCalled();
    });

    it('inserts when update returns nothing (no existing row)', async () => {
      const updateChain = chainMock([undefined]);
      const newSettings = buildDefaultSettings({ watcherEnabled: false });
      const insertChain = chainMock([newSettings]);
      const appEvents = createMockAppEvents();

      const db = createMockDb({
        update: jest.fn().mockReturnValue(updateChain),
        insert: jest.fn().mockReturnValue(insertChain),
      });
      const service = new AppSettingsService(db, appEvents);

      const result = await service.updateSettings({ watcherEnabled: false });

      expect(db.insert).toHaveBeenCalledWith(schema.appSettings);
      expect(insertChain.values).toHaveBeenCalledWith({
        id: 'app_settings',
        watcherEnabled: false,
      });
      expect(result).toEqual(newSettings);
      expect(appEvents.settingsUpdated).toHaveBeenCalled();
    });

    it('updates multiple fields at once', async () => {
      const updates = {
        signupsEnabled: false,
        audiobookLibraryPath: '/audiobooks',
        watcherEnabled: false,
      };
      const updated = buildDefaultSettings(updates);
      const updateChain = chainMock([updated]);
      const db = createMockDb({
        update: jest.fn().mockReturnValue(updateChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.updateSettings(updates);

      expect(updateChain.set).toHaveBeenCalledWith(updates);
      expect(result).toEqual(updated);
    });
  });

  // -----------------------------------------------------------------------
  // isSignupEnabled
  // -----------------------------------------------------------------------
  describe('isSignupEnabled', () => {
    it('returns true when signups are enabled', async () => {
      const settings = buildDefaultSettings({ signupsEnabled: true });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isSignupEnabled()).toBe(true);
    });

    it('returns false when signups are disabled', async () => {
      const settings = buildDefaultSettings({ signupsEnabled: false });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isSignupEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getAudiobookLibraryPath
  // -----------------------------------------------------------------------
  describe('getAudiobookLibraryPath', () => {
    it('returns the configured path', async () => {
      const settings = buildDefaultSettings({
        audiobookLibraryPath: '/media/audiobooks',
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.getAudiobookLibraryPath()).toBe('/media/audiobooks');
    });

    it('returns null when no path is set', async () => {
      const settings = buildDefaultSettings({ audiobookLibraryPath: null });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.getAudiobookLibraryPath()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getEbookLibraryPath
  // -----------------------------------------------------------------------
  describe('getEbookLibraryPath', () => {
    it('returns the configured path', async () => {
      const settings = buildDefaultSettings({
        ebookLibraryPath: '/media/ebooks',
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.getEbookLibraryPath()).toBe('/media/ebooks');
    });
  });

  // -----------------------------------------------------------------------
  // isWatcherEnabled
  // -----------------------------------------------------------------------
  describe('isWatcherEnabled', () => {
    it('returns the watcher setting', async () => {
      const settings = buildDefaultSettings({ watcherEnabled: false });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isWatcherEnabled()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getMetadataPriority
  // -----------------------------------------------------------------------
  describe('getMetadataPriority', () => {
    it('returns stored metadata priority when set', async () => {
      const customPriority = {
        ...DEFAULT_METADATA_PRIORITY,
        title: ['hardcover', 'embedded'] as any,
      };
      const settings = buildDefaultSettings({
        metadataPriority: customPriority,
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getMetadataPriority();

      expect(result).toEqual(customPriority);
    });

    it('returns DEFAULT_METADATA_PRIORITY when not set', async () => {
      const settings = buildDefaultSettings({ metadataPriority: null });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getMetadataPriority();

      expect(result).toEqual(DEFAULT_METADATA_PRIORITY);
    });
  });

  // -----------------------------------------------------------------------
  // isOpdsEnabled
  // -----------------------------------------------------------------------
  describe('isOpdsEnabled', () => {
    it('returns the opds setting', async () => {
      const settings = buildDefaultSettings({ opdsEnabled: true });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isOpdsEnabled()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getRequestsCategories
  // -----------------------------------------------------------------------
  describe('getRequestsCategories', () => {
    it('returns configured category names', async () => {
      const settings = buildDefaultSettings({
        requestsAudiobookCategory: 'my-audiobooks',
        requestsEbookCategory: 'my-books',
        requestsComicsCategory: 'my-comics',
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getRequestsCategories();

      expect(result).toEqual({
        audiobook: 'my-audiobooks',
        ebook: 'my-books',
        comics: 'my-comics',
      });
    });
  });

  // -----------------------------------------------------------------------
  // getDefaultUserPermissions
  // -----------------------------------------------------------------------
  describe('getDefaultUserPermissions', () => {
    it('returns all default permissions', async () => {
      const settings = buildDefaultSettings({
        defaultCanEditMetadata: true,
        defaultCanUpload: true,
        defaultCanDelete: false,
        defaultCanGenerateApiKeys: false,
        defaultCanRequestContent: true,
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getDefaultUserPermissions();

      expect(result).toEqual({
        canEditMetadata: true,
        canUpload: true,
        canDelete: false,
        canGenerateApiKeys: false,
        canRequestContent: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // isSetupCompleted
  // -----------------------------------------------------------------------
  describe('isSetupCompleted', () => {
    it('returns true when users exist', async () => {
      const selectChain = chainMock([{ id: 'user-1' }]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isSetupCompleted()).toBe(true);
    });

    it('returns false when no users exist', async () => {
      const selectChain = chainMock([]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isSetupCompleted()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isRequestsEnabled
  // -----------------------------------------------------------------------
  describe('isRequestsEnabled', () => {
    it('returns true when requests are enabled', async () => {
      const settings = buildDefaultSettings({ requestsEnabled: true });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isRequestsEnabled()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getOidcButtonText / isEmailPasswordEnabled / getOidcAutoCreateUsers
  // -----------------------------------------------------------------------
  describe('auth settings', () => {
    it('getOidcButtonText returns the configured text', async () => {
      const settings = buildDefaultSettings({
        oidcButtonText: 'Login with OIDC',
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.getOidcButtonText()).toBe('Login with OIDC');
    });

    it('isEmailPasswordEnabled returns the setting', async () => {
      const settings = buildDefaultSettings({ emailPasswordEnabled: false });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.isEmailPasswordEnabled()).toBe(false);
    });

    it('getOidcAutoCreateUsers returns the setting', async () => {
      const settings = buildDefaultSettings({
        oidcAutoCreateUsers: 'disabled',
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      expect(await service.getOidcAutoCreateUsers()).toBe('disabled');
    });
  });

  // -----------------------------------------------------------------------
  // comicMetadataPriority via updateSettings
  // -----------------------------------------------------------------------
  describe('comicMetadataPriority updateSettings', () => {
    it('persists comicMetadataPriority when provided', async () => {
      const customPriority = {
        ...DEFAULT_COMIC_METADATA_PRIORITY,
        title: ['manual', 'comicvine'] as any,
      };
      const updated = buildDefaultSettings({
        comicMetadataPriority: customPriority,
      });
      const updateChain = chainMock([updated]);
      const db = createMockDb({
        update: jest.fn().mockReturnValue(updateChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.updateSettings({
        comicMetadataPriority: customPriority,
      });

      expect(updateChain.set).toHaveBeenCalledWith({
        comicMetadataPriority: customPriority,
      });
      expect(result).toEqual(updated);
    });
  });

  // -----------------------------------------------------------------------
  // getComicMetadataPriority
  // -----------------------------------------------------------------------
  describe('getComicMetadataPriority', () => {
    it('returns stored comic metadata priority when set', async () => {
      const customPriority = {
        ...DEFAULT_COMIC_METADATA_PRIORITY,
        title: ['comicvine', 'manual'] as any,
      };
      const settings = buildDefaultSettings({
        comicMetadataPriority: customPriority,
      });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getComicMetadataPriority();

      expect(result).toEqual(customPriority);
    });

    it('returns DEFAULT_COMIC_METADATA_PRIORITY when not set', async () => {
      const settings = buildDefaultSettings({ comicMetadataPriority: null });
      const selectChain = chainMock([settings]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });
      const service = new AppSettingsService(db, createMockAppEvents());

      const result = await service.getComicMetadataPriority();

      expect(result).toEqual(DEFAULT_COMIC_METADATA_PRIORITY);
    });
  });
});
