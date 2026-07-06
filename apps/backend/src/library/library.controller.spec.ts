jest.mock('./library.service', () => ({
  LibraryService: class LibraryService {},
}));

jest.mock('../app-settings/app-settings.service', () => ({
  AppSettingsService: class AppSettingsService {},
}));

import { LibraryController } from './library.controller';

function createController(settings: Record<string, unknown> = {}) {
  const libraryService = {
    getStats: jest.fn().mockResolvedValue({ totalAudiobooks: 1 }),
    searchLibrary: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  };
  const appSettingsService = {
    getSettings: jest.fn().mockResolvedValue({
      audiobookLibraryPath: '/audio',
      ebookLibraryPath: null,
      comicLibraryPath: '/comics',
      opdsEnabled: false,
      ...settings,
    }),
  };

  return {
    controller: new LibraryController(
      libraryService as any,
      appSettingsService as any,
    ),
    libraryService,
    appSettingsService,
  };
}

describe('LibraryController', () => {
  it('returns library stats from the service', async () => {
    const { controller, libraryService } = createController();

    await expect(controller.getStats()).resolves.toEqual({
      totalAudiobooks: 1,
    });
    expect(libraryService.getStats).toHaveBeenCalledWith();
  });

  it('returns feature availability from settings', async () => {
    const { controller } = createController({
      ebookLibraryPath: '/ebooks',
      opdsEnabled: true,
    });

    await expect(controller.getAvailability()).resolves.toEqual({
      audiobooks: true,
      ebooks: true,
      comics: true,
      opds: true,
    });
  });

  it('searches the library with query DTO values', async () => {
    const { controller, libraryService } = createController();
    const query = {
      query: 'Dune',
      contentType: 'audiobook',
      limit: 5,
    } as any;

    await expect(controller.search(query)).resolves.toEqual({
      results: [],
      total: 0,
    });
    expect(libraryService.searchLibrary).toHaveBeenCalledWith(
      'Dune',
      'audiobook',
      5,
    );
  });
});
