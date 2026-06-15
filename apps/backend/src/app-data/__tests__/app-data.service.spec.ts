import * as fs from 'fs/promises';
import * as path from 'path';

import { AppDataService } from '../app-data.service';

jest.mock('fs/promises');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfigService(
  values: Record<string, string | undefined> = {},
) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('uses APP_DATA_PATH when provided', () => {
      const configService = createMockConfigService({
        APP_DATA_PATH: '/custom/data',
      });
      const service = new AppDataService(configService as any);

      expect(service.getBasePath()).toBe('/custom/data');
    });

    it('defaults to ./data in non-production mode', () => {
      const configService = createMockConfigService({
        NODE_ENV: 'development',
      });
      const service = new AppDataService(configService as any);

      expect(service.getBasePath()).toBe('./data');
    });

    it('defaults to ./data when NODE_ENV is not set', () => {
      const configService = createMockConfigService({});
      const service = new AppDataService(configService as any);

      expect(service.getBasePath()).toBe('./data');
    });

    it('throws in production mode without APP_DATA_PATH', () => {
      const configService = createMockConfigService({
        NODE_ENV: 'production',
      });

      expect(() => new AppDataService(configService as any)).toThrow(
        'APP_DATA_PATH must be configured in production',
      );
    });

    it('does not throw in production mode when APP_DATA_PATH is provided', () => {
      const configService = createMockConfigService({
        NODE_ENV: 'production',
        APP_DATA_PATH: '/app/data',
      });

      expect(() => new AppDataService(configService as any)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // onModuleInit
  // -------------------------------------------------------------------------
  describe('onModuleInit', () => {
    it('creates all required directories', async () => {
      const configService = createMockConfigService({
        APP_DATA_PATH: '/app/data',
      });
      const service = new AppDataService(configService as any);

      await service.onModuleInit();

      expect(fs.mkdir).toHaveBeenCalledTimes(7);
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'audiobook-covers'),
        { recursive: true },
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'ebook-covers'),
        { recursive: true },
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'comic-series-covers'),
        { recursive: true },
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'comic-book-covers'),
        { recursive: true },
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'people-images'),
        { recursive: true },
      );
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('/app/data', 'temp'), {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/app/data', 'comic-page-cache'),
        { recursive: true },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Path construction methods
  // -------------------------------------------------------------------------
  describe('path construction', () => {
    let service: AppDataService;

    beforeEach(() => {
      const configService = createMockConfigService({
        APP_DATA_PATH: '/app/data',
      });
      service = new AppDataService(configService as any);
    });

    it('getAudiobookCoversPath returns correct path', () => {
      expect(service.getAudiobookCoversPath()).toBe(
        path.join('/app/data', 'audiobook-covers'),
      );
    });

    it('getEbookCoversPath returns correct path', () => {
      expect(service.getEbookCoversPath()).toBe(
        path.join('/app/data', 'ebook-covers'),
      );
    });

    it('getPeopleImagesPath returns correct path', () => {
      expect(service.getPeopleImagesPath()).toBe(
        path.join('/app/data', 'people-images'),
      );
    });

    it('getTempPath returns correct path', () => {
      expect(service.getTempPath()).toBe(path.join('/app/data', 'temp'));
    });

    it('getAudiobookCoverPath returns correct path for a given ID', () => {
      expect(service.getAudiobookCoverPath('abc-123')).toBe(
        path.join('/app/data', 'audiobook-covers', 'abc-123.jpg'),
      );
    });

    it('getEbookCoverPath returns correct path for a given ID', () => {
      expect(service.getEbookCoverPath('ebook-456')).toBe(
        path.join('/app/data', 'ebook-covers', 'ebook-456.jpg'),
      );
    });

    it('getComicSeriesCoverPath returns correct path for a given ID', () => {
      expect(service.getComicSeriesCoverPath('series-123')).toBe(
        path.join('/app/data', 'comic-series-covers', 'series-123.jpg'),
      );
    });

    it('getComicBookCoverPath returns correct path for a given ID', () => {
      expect(service.getComicBookCoverPath('book-321')).toBe(
        path.join('/app/data', 'comic-book-covers', 'book-321.jpg'),
      );
    });

    it('getPersonImagePath returns correct path for a given ID', () => {
      expect(service.getPersonImagePath('person-789')).toBe(
        path.join('/app/data', 'people-images', 'person-789.jpg'),
      );
    });

    it('getTempSessionPath returns correct path for a given session ID', () => {
      expect(service.getTempSessionPath('session-001')).toBe(
        path.join('/app/data', 'temp', 'session-001'),
      );
    });

    it('getComicPageCacheBasePath returns correct path', () => {
      expect(service.getComicPageCacheBasePath()).toBe(
        path.join('/app/data', 'comic-page-cache'),
      );
    });

    it('getComicPageCacheDir returns correct directory for a given book ID', () => {
      expect(service.getComicPageCacheDir('book-abc')).toBe(
        path.join('/app/data', 'comic-page-cache', 'book-abc'),
      );
    });

    it('getComicPageCachePath returns correct file path', () => {
      expect(service.getComicPageCachePath('book-abc', 3, 'o')).toBe(
        path.join('/app/data', 'comic-page-cache', 'book-abc', '3_o.jpg'),
      );
    });

    it('getComicPageCachePath returns correct file path for a size variant', () => {
      expect(service.getComicPageCachePath('book-abc', 0, '1200x0')).toBe(
        path.join('/app/data', 'comic-page-cache', 'book-abc', '0_1200x0.jpg'),
      );
    });

    it('getComicPageCachePath sanitizes the variant', () => {
      // Dots, slashes, and other special chars should be stripped
      expect(service.getComicPageCachePath('book-abc', 1, '../evil')).toBe(
        path.join('/app/data', 'comic-page-cache', 'book-abc', '1_evil.jpg'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sanitizeId (tested through public methods)
  // -------------------------------------------------------------------------
  describe('sanitizeId', () => {
    let service: AppDataService;

    beforeEach(() => {
      const configService = createMockConfigService({
        APP_DATA_PATH: '/app/data',
      });
      service = new AppDataService(configService as any);
    });

    it('preserves valid UUIDs', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(service.getAudiobookCoverPath(uuid)).toBe(
        path.join('/app/data', 'audiobook-covers', `${uuid}.jpg`),
      );
    });

    it('strips path traversal characters like ../', () => {
      const malicious = '../../etc/passwd';
      // After sanitization: "etcpasswd" (dots and slashes removed)
      expect(service.getAudiobookCoverPath(malicious)).toBe(
        path.join('/app/data', 'audiobook-covers', 'etcpasswd.jpg'),
      );
    });

    it('strips special characters', () => {
      const withSpecials = 'id<with>special&chars!';
      // After sanitization: "idwithspecialchars"
      expect(service.getAudiobookCoverPath(withSpecials)).toBe(
        path.join('/app/data', 'audiobook-covers', 'idwithspecialchars.jpg'),
      );
    });

    it('handles empty string', () => {
      expect(service.getAudiobookCoverPath('')).toBe(
        path.join('/app/data', 'audiobook-covers', '.jpg'),
      );
    });

    it('preserves underscores and hyphens', () => {
      const id = 'my_id-with-valid_chars';
      expect(service.getAudiobookCoverPath(id)).toBe(
        path.join('/app/data', 'audiobook-covers', `${id}.jpg`),
      );
    });
  });
});
