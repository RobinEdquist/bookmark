import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CoverService, type CoverOperationConfig } from '../cover.service';

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

describe('CoverService', () => {
  let service: CoverService;
  let mockImageProcessing: { processCover: jest.Mock };

  beforeEach(() => {
    mockImageProcessing = {
      processCover: jest.fn().mockResolvedValue(Buffer.from('processed')),
    };
    service = new CoverService(mockImageProcessing as any);
  });

  describe('getCoverUrl', () => {
    it('returns API URL when coverUrl is set', () => {
      const result = service.getCoverUrl(
        'abc-123',
        'abc-123.jpg',
        null,
        'audiobooks',
      );
      expect(result).toBe('/api/audiobooks/abc-123/cover');
    });

    it('returns API URL when coverSource is set', () => {
      const result = service.getCoverUrl(
        'abc-123',
        null,
        'hardcover',
        'audiobooks',
      );
      expect(result).toBe('/api/audiobooks/abc-123/cover');
    });

    it('returns API URL when both coverUrl and coverSource are set', () => {
      const result = service.getCoverUrl(
        'abc-123',
        'abc-123.jpg',
        'hardcover',
        'ebooks',
      );
      expect(result).toBe('/api/ebooks/abc-123/cover');
    });

    it('returns null when neither coverUrl nor coverSource is set', () => {
      const result = service.getCoverUrl('abc-123', null, null, 'audiobooks');
      expect(result).toBeNull();
    });

    it('returns null when coverUrl is empty string and coverSource is null', () => {
      // Empty string is falsy
      const result = service.getCoverUrl('abc-123', '', null, 'audiobooks');
      expect(result).toBeNull();
    });

    it('uses the correct apiPath for ebooks', () => {
      const result = service.getCoverUrl(
        'ebook-1',
        'ebook-1.jpg',
        null,
        'ebooks',
      );
      expect(result).toBe('/api/ebooks/ebook-1/cover');
    });
  });

  describe('updateCoverFromFile', () => {
    let config: CoverOperationConfig;

    beforeEach(() => {
      config = {
        entityId: 'test-id',
        apiPath: 'audiobooks',
        getCoverPath: jest.fn().mockReturnValue('/data/covers/test-id.jpg'),
        verifyExists: jest.fn().mockResolvedValue(undefined),
        updateCoverMetadata: jest.fn().mockResolvedValue(undefined),
        emitUpdateEvent: jest.fn(),
      };
    });

    it('returns the API cover URL after processing', async () => {
      const result = await service.updateCoverFromFile(
        Buffer.from('image-data'),
        config,
      );

      expect(result).toEqual({ coverUrl: '/api/audiobooks/test-id/cover' });
      expect(config.verifyExists).toHaveBeenCalledWith('test-id');
      expect(mockImageProcessing.processCover).toHaveBeenCalledWith(
        Buffer.from('image-data'),
      );
      expect(config.updateCoverMetadata).toHaveBeenCalledWith(
        'test-id',
        'test-id.jpg',
      );
      expect(config.emitUpdateEvent).toHaveBeenCalledWith('test-id');
    });

    it('throws BadRequestException for invalid image', async () => {
      mockImageProcessing.processCover.mockRejectedValue(new Error('Invalid'));

      await expect(
        service.updateCoverFromFile(Buffer.from('not-an-image'), config),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCoverFromUrl', () => {
    let config: CoverOperationConfig;

    beforeEach(() => {
      config = {
        entityId: 'test-id',
        apiPath: 'audiobooks',
        getCoverPath: jest.fn().mockReturnValue('/data/covers/test-id.jpg'),
        verifyExists: jest.fn().mockResolvedValue(undefined),
        updateCoverMetadata: jest.fn().mockResolvedValue(undefined),
        emitUpdateEvent: jest.fn(),
      };
    });

    it('throws UnprocessableEntityException when fetch fails', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await expect(
        service.updateCoverFromUrl('https://example.com/cover.jpg', config),
      ).rejects.toThrow(UnprocessableEntityException);

      globalThis.fetch = originalFetch;
    });

    it('throws UnprocessableEntityException for non-OK response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/cover.jpg', config),
      ).rejects.toThrow(UnprocessableEntityException);

      globalThis.fetch = originalFetch;
    });

    it('throws BadRequestException for non-image content type', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/html']]) as any,
      });
      // Patch get method
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: {
          get: (h: string) => (h === 'content-type' ? 'text/html' : null),
        },
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/page.html', config),
      ).rejects.toThrow(BadRequestException);

      globalThis.fetch = originalFetch;
    });

    it('throws BadRequestException when content-length exceeds 2MB', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (h: string) => {
            if (h === 'content-type') return 'image/jpeg';
            if (h === 'content-length') return String(3 * 1024 * 1024); // 3MB
            return null;
          },
        },
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/huge.jpg', config),
      ).rejects.toThrow(BadRequestException);

      globalThis.fetch = originalFetch;
    });
  });
});
