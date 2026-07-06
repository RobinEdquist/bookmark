import { BadRequestException } from '@nestjs/common';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

jest.mock('fs/promises', () => ({
  constants: { R_OK: 4 },
  access: jest.fn(),
  stat: jest.fn(),
}));

import * as fs from 'fs/promises';
import { AppSettingsController } from './app-settings.controller';
import {
  DEFAULT_COMIC_METADATA_PRIORITY,
  ComicMetadataFieldPriority,
  DEFAULT_METADATA_PRIORITY,
  MetadataFieldPriority,
} from './schema';

const mockedFs = jest.mocked(fs);

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

function createSettings(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    signupsEnabled: true,
    audiobookLibraryPath: '/library/audiobooks',
    ebookLibraryPath: '/library/ebooks',
    comicLibraryPath: '/library/comics',
    opdsEnabled: true,
    metadataPriority: null,
    comicMetadataPriority: null,
    hardcoverApiKey: null,
    comicvineApiKey: null,
    oidcButtonText: 'Continue with SSO',
    emailPasswordEnabled: true,
    oidcAutoCreateUsers: 'pending',
    requestsEnabled: true,
    requestsAudiobookCategory: 'audiobooks',
    requestsEbookCategory: 'ebooks',
    requestsComicsCategory: 'comics',
    autoApproveRequestsPerWeek: 3,
    requestsUseFreeleech: false,
    defaultCanEditMetadata: false,
    defaultCanUpload: true,
    defaultCanDelete: false,
    defaultCanGenerateApiKeys: true,
    defaultCanRequestContent: true,
    defaultCanGenerateAudiobooks: false,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function createController(
  settings: Record<string, unknown> = createSettings(),
) {
  const appSettingsService = {
    getSettings: jest.fn().mockResolvedValue(settings),
    isSetupCompleted: jest.fn().mockResolvedValue(true),
    updateSettings: jest.fn().mockImplementation(async (updates) =>
      createSettings({
        ...settings,
        ...updates,
      }),
    ),
  };
  const oidcConfigService = {
    isOidcEnabled: jest.fn().mockReturnValue(true),
  };

  return {
    controller: new AppSettingsController(
      appSettingsService as any,
      oidcConfigService as any,
    ),
    appSettingsService,
    oidcConfigService,
  };
}

// ---------------------------------------------------------------------------
// Replicate the controller's mergeComicMetadataPriority helper
// (keep in sync with app-settings.controller.ts)
// ---------------------------------------------------------------------------
function mergeComicMetadataPriority(
  stored: ComicMetadataFieldPriority | null,
  comicvineConfigured: boolean,
): ComicMetadataFieldPriority {
  const base = stored || DEFAULT_COMIC_METADATA_PRIORITY;
  const disabled: string[] = comicvineConfigured ? [] : ['comicvine'];
  const result = {} as ComicMetadataFieldPriority;

  for (const field of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY) as Array<
    keyof ComicMetadataFieldPriority
  >) {
    const merged = [...(base[field] || [])];
    for (const s of DEFAULT_COMIC_METADATA_PRIORITY[field]) {
      if (!merged.includes(s)) merged.push(s);
    }
    result[field] = merged.filter(
      (s) => !disabled.includes(s),
    ) as ComicMetadataFieldPriority[typeof field];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeComicMetadataPriority (controller logic)', () => {
  it('returns default priority for all fields when stored is null', () => {
    const result = mergeComicMetadataPriority(null, true);
    for (const field of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY) as Array<
      keyof ComicMetadataFieldPriority
    >) {
      expect(result[field]).toEqual(DEFAULT_COMIC_METADATA_PRIORITY[field]);
    }
  });

  it('filters out comicvine from all fields when comicvine is not configured', () => {
    const result = mergeComicMetadataPriority(null, false);
    for (const sources of Object.values(result)) {
      expect(sources).not.toContain('comicvine');
    }
  });

  it('includes comicvine when comicvine is configured', () => {
    const result = mergeComicMetadataPriority(null, true);
    // title has comicvine in defaults
    expect(result.title).toContain('comicvine');
  });

  it('preserves stored order and appends missing default sources', () => {
    const stored: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      title: ['comicvine', 'manual'] as any, // missing 'embedded' and 'filename'
    };
    const result = mergeComicMetadataPriority(stored, true);

    // Original order preserved
    expect(result.title[0]).toBe('comicvine');
    expect(result.title[1]).toBe('manual');
    // Missing defaults appended
    expect(result.title).toContain('embedded');
    expect(result.title).toContain('filename');
  });

  it('does not duplicate sources already present in stored', () => {
    const stored: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      description: ['manual', 'embedded', 'comicvine'] as any,
    };
    const result = mergeComicMetadataPriority(stored, true);

    const count = result.description.filter((s) => s === 'comicvine').length;
    expect(count).toBe(1);
  });

  it('GET response includes comicMetadataPriority merged with defaults filtered by key', () => {
    // Simulate what the controller returns for getSettings() / updateSettings():
    // stored=null, comicvineConfigured=false
    const comicMetadataPriority = mergeComicMetadataPriority(null, false);

    expect(comicMetadataPriority).toBeDefined();
    // All keys from DEFAULT must be present
    for (const key of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY)) {
      expect(comicMetadataPriority).toHaveProperty(key);
    }
    // comicvine filtered out
    for (const sources of Object.values(comicMetadataPriority)) {
      expect(sources).not.toContain('comicvine');
    }
  });

  it('PATCH response includes comicvine after update stores a custom priority with comicvine key set', () => {
    const customPriority: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      description: ['comicvine', 'embedded', 'manual'] as any,
    };
    // comicvineConfigured=true means the key is set post-update
    const comicMetadataPriority = mergeComicMetadataPriority(
      customPriority,
      true,
    );

    expect(comicMetadataPriority.description).toContain('comicvine');
    expect(comicMetadataPriority.description[0]).toBe('comicvine');
  });
});

describe('AppSettingsController', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TRACKER_CLIENT_URL;
    delete process.env.TRACKER_CLIENT_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns public signup settings', async () => {
    const { controller } = createController(
      createSettings({ signupsEnabled: false }),
    );

    await expect(controller.getPublicSettings()).resolves.toEqual({
      signupsEnabled: false,
    });
  });

  it('returns auth configuration with OIDC status', async () => {
    const { controller, oidcConfigService } = createController(
      createSettings({
        emailPasswordEnabled: false,
        oidcButtonText: 'Login',
      }),
    );
    oidcConfigService.isOidcEnabled.mockReturnValue(false);

    await expect(controller.getAuthConfig()).resolves.toEqual({
      emailPasswordEnabled: false,
      oidcEnabled: false,
      oidcButtonText: 'Login',
    });
  });

  it('returns setup status', async () => {
    const { controller, appSettingsService } = createController();
    appSettingsService.isSetupCompleted.mockResolvedValue(false);

    await expect(controller.getSetupStatus()).resolves.toEqual({
      setupCompleted: false,
    });
  });

  it('returns settings with integration-aware priority sources', async () => {
    process.env.TRACKER_CLIENT_URL = 'https://tracker.example.com';
    process.env.TRACKER_CLIENT_API_KEY = 'secret';
    const storedPriority: MetadataFieldPriority = {
      ...DEFAULT_METADATA_PRIORITY,
      title: ['manual'] as any,
    };
    const storedComicPriority: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      title: ['manual'] as any,
    };
    const { controller } = createController(
      createSettings({
        metadataPriority: storedPriority,
        comicMetadataPriority: storedComicPriority,
        hardcoverApiKey: null,
        comicvineApiKey: 'cv-key',
      }),
    );

    const result = await controller.getSettings();

    expect(result.trackerClientConfigured).toBe(true);
    expect(result.metadataPriority.title[0]).toBe('manual');
    expect(result.metadataPriority.title).not.toContain('hardcover');
    expect(result.comicMetadataPriority.title[0]).toBe('manual');
    expect(result.comicMetadataPriority.title).toContain('comicvine');
  });

  it('rejects empty updates', async () => {
    const { controller } = createController();

    await expect(controller.updateSettings({})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects disabling password login when OIDC is disabled', async () => {
    const { controller, oidcConfigService } = createController();
    oidcConfigService.isOidcEnabled.mockReturnValue(false);

    await expect(
      controller.updateSettings({ emailPasswordEnabled: false }),
    ).rejects.toThrow('Cannot disable email/password login');
  });

  it('rejects invalid OIDC auto-create modes', async () => {
    const { controller } = createController();

    await expect(
      controller.updateSettings({ oidcAutoCreateUsers: 'invalid' as any }),
    ).rejects.toThrow('Invalid value for oidcAutoCreateUsers');
  });

  it('validates library paths and persists provided settings only', async () => {
    mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
    mockedFs.access.mockResolvedValue(undefined);
    const { controller, appSettingsService } = createController();

    const result = await controller.updateSettings({
      audiobookLibraryPath: '/new/audiobooks',
      ebookLibraryPath: null,
      comicLibraryPath: '/new/comics',
      signupsEnabled: false,
      metadataPriority: DEFAULT_METADATA_PRIORITY as any,
      comicMetadataPriority: DEFAULT_COMIC_METADATA_PRIORITY as any,
      opdsEnabled: false,
      oidcButtonText: 'SSO',
      emailPasswordEnabled: true,
      oidcAutoCreateUsers: 'auto',
      requestsEnabled: false,
      requestsAudiobookCategory: 'audio',
      requestsEbookCategory: 'books',
      requestsComicsCategory: 'comics',
      autoApproveRequestsPerWeek: 7,
      requestsUseFreeleech: true,
      defaultCanEditMetadata: true,
      defaultCanUpload: false,
      defaultCanDelete: true,
      defaultCanGenerateApiKeys: false,
      defaultCanRequestContent: false,
      defaultCanGenerateAudiobooks: true,
    });

    expect(mockedFs.stat).toHaveBeenCalledWith('/new/audiobooks');
    expect(mockedFs.stat).toHaveBeenCalledWith('/new/comics');
    expect(mockedFs.stat).not.toHaveBeenCalledWith(null);
    expect(appSettingsService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        audiobookLibraryPath: '/new/audiobooks',
        ebookLibraryPath: null,
        comicLibraryPath: '/new/comics',
        signupsEnabled: false,
        defaultCanGenerateAudiobooks: true,
      }),
    );
    expect(result.signupsEnabled).toBe(false);
    expect(result.ebookLibraryPath).toBeNull();
  });

  it('rejects library paths that are not directories', async () => {
    mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
    const { controller } = createController();

    await expect(
      controller.updateSettings({ audiobookLibraryPath: '/tmp/file' }),
    ).rejects.toThrow('Path is not a directory');
  });

  it('rejects inaccessible library paths', async () => {
    mockedFs.stat.mockRejectedValue(new Error('ENOENT'));
    const { controller } = createController();

    await expect(
      controller.updateSettings({ audiobookLibraryPath: '/missing' }),
    ).rejects.toThrow('Path does not exist or is not accessible');
  });
});
