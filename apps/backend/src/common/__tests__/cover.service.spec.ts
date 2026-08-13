import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CoverService, type CoverOperationConfig } from '../cover.service';
import {
  BlockedUrlError,
  ResponseTooLargeError,
  safeFetchUrl,
} from '../safe-fetch.util';

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../safe-fetch.util', () => {
  const actual = jest.requireActual('../safe-fetch.util');
  return { ...actual, safeFetchUrl: jest.fn() };
});

const mockSafeFetchUrl = safeFetchUrl as jest.MockedFunction<
  typeof safeFetchUrl
>;

// Minimal valid JPEG header so the magic-byte sniff passes
const jpegBytes = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16),
]);

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

    afterEach(() => {
      mockSafeFetchUrl.mockReset();
    });

    it('downloads, processes, and saves a valid image', async () => {
      mockSafeFetchUrl.mockResolvedValue({
        status: 200,
        contentType: 'image/jpeg',
        body: jpegBytes,
      });

      const result = await service.updateCoverFromUrl(
        'https://example.com/cover.jpg',
        config,
      );

      expect(result).toEqual({ coverUrl: '/api/audiobooks/test-id/cover' });
      expect(mockSafeFetchUrl).toHaveBeenCalledWith(
        'https://example.com/cover.jpg',
        expect.objectContaining({ maxBytes: 2 * 1024 * 1024 }),
      );
      expect(mockImageProcessing.processCover).toHaveBeenCalledWith(jpegBytes);
    });

    it('throws UnprocessableEntityException when fetch fails', async () => {
      mockSafeFetchUrl.mockRejectedValue(new Error('Network error'));

      await expect(
        service.updateCoverFromUrl('https://example.com/cover.jpg', config),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws BadRequestException for a blocked (SSRF) destination', async () => {
      mockSafeFetchUrl.mockRejectedValue(
        new BlockedUrlError('URL resolves to a disallowed address'),
      );

      await expect(
        service.updateCoverFromUrl('http://169.254.169.254/x.jpg', config),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the body exceeds the size budget', async () => {
      mockSafeFetchUrl.mockRejectedValue(
        new ResponseTooLargeError('Response exceeded 2097152 bytes'),
      );

      await expect(
        service.updateCoverFromUrl('https://example.com/huge.jpg', config),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnprocessableEntityException for non-OK response', async () => {
      mockSafeFetchUrl.mockResolvedValue({
        status: 404,
        contentType: null,
        body: Buffer.alloc(0),
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/cover.jpg', config),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws BadRequestException for non-image content type', async () => {
      mockSafeFetchUrl.mockResolvedValue({
        status: 200,
        contentType: 'text/html',
        body: Buffer.from('<html></html>'),
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/page.html', config),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the body is not really an image', async () => {
      mockSafeFetchUrl.mockResolvedValue({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from('<html>this is not an image at all</html>'),
      });

      await expect(
        service.updateCoverFromUrl('https://example.com/fake.jpg', config),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
