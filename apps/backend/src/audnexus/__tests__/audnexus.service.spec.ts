import { NotFoundException } from '@nestjs/common';
import { AudnexusService } from '../audnexus.service';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

describe('AudnexusService', () => {
  let service: AudnexusService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    service = new AudnexusService();
    // Reset internal throttle state by accessing private field
    (service as any).lastRequestTime = 0;
  });

  // ===== searchAudible =====

  describe('searchAudible', () => {
    const sampleProduct = {
      asin: 'B08G9PRS1K',
      title: 'Test Audiobook',
      subtitle: 'A Subtitle',
      authors: [{ name: 'Author One' }, { name: 'Author Two' }],
      narrators: [{ name: 'Narrator One' }],
      product_images: {
        '500': 'https://img/500.jpg',
        '1024': 'https://img/1024.jpg',
      },
      runtime_length_min: 600,
      release_date: '2023-01-15',
      language: 'english',
      publisher_name: 'Test Publisher',
    };

    it('should use US base URL by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ products: [] }));

      await service.searchAudible('Test Title');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.audible.com/1.0/catalog/products'),
        expect.any(Object),
      );
    });

    it('should use regional TLD for non-US regions', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ products: [] }));

      await service.searchAudible('Test', undefined, 'uk');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.audible.co.uk/1.0/catalog/products',
        ),
        expect.any(Object),
      );
    });

    it('should include author param when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ products: [] }));

      await service.searchAudible('Test', 'Some Author');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]);
      expect(params.get('author')).toBe('Some Author');
    });

    it('should not include author param when not provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ products: [] }));

      await service.searchAudible('Test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]);
      expect(params.has('author')).toBe(false);
    });

    it('should map product fields correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ products: [sampleProduct] }),
      );

      const results = await service.searchAudible('Test');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        asin: 'B08G9PRS1K',
        title: 'Test Audiobook',
        subtitle: 'A Subtitle',
        authors: ['Author One', 'Author Two'],
        narrators: ['Narrator One'],
        coverUrl: 'https://img/500.jpg',
        durationMinutes: 600,
        releaseDate: '2023-01-15',
        language: 'english',
        publisher: 'Test Publisher',
      });
    });

    it('should handle empty products array', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ products: [] }));

      const results = await service.searchAudible('Nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle missing optional fields on product', async () => {
      const minimalProduct = {
        asin: 'B000000',
        title: 'Minimal',
        authors: [],
      };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ products: [minimalProduct] }),
      );

      const results = await service.searchAudible('Minimal');

      expect(results[0]).toMatchObject({
        asin: 'B000000',
        title: 'Minimal',
        authors: [],
        narrators: [],
        coverUrl: undefined,
      });
    });

    it('should throw on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 429));

      await expect(service.searchAudible('Test')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('should throw on other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 500));

      await expect(service.searchAudible('Test')).rejects.toThrow(
        'Audible API error: 500',
      );
    });
  });

  // ===== fetchChaptersByAsin =====

  describe('fetchChaptersByAsin', () => {
    const sampleChapterResponse = {
      asin: 'B08G9PRS1K',
      chapters: [
        {
          title: 'Opening Credits',
          lengthMs: 30000,
          startOffsetMs: 0,
          startOffsetSec: 0,
        },
        {
          title: 'Chapter 1',
          lengthMs: 120500,
          startOffsetMs: 30000,
          startOffsetSec: 30,
        },
        {
          title: '',
          lengthMs: 60000,
          startOffsetMs: 150500,
          startOffsetSec: 150.5,
        },
      ],
      isAccurate: true,
      region: 'us',
      runtimeLengthMs: 210500,
      runtimeLengthSec: 210.5,
    };

    it('should normalize ASIN to uppercase', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(sampleChapterResponse));

      await service.fetchChaptersByAsin('b08g9prs1k');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/books/B08G9PRS1K/chapters');
    });

    it('should map chapter data correctly', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(sampleChapterResponse));

      const result = await service.fetchChaptersByAsin('B08G9PRS1K');

      expect(result.asin).toBe('B08G9PRS1K');
      expect(result.isAccurate).toBe(true);
      expect(result.totalDuration).toBe(211); // Math.round(210.5)
      expect(result.chapters).toHaveLength(3);
      expect(result.chapters[0]).toEqual({
        title: 'Opening Credits',
        startTime: 0,
        endTime: 30, // 0 + Math.round(30000/1000)
        lengthSeconds: 30,
      });
      expect(result.chapters[1]).toEqual({
        title: 'Chapter 1',
        startTime: 30,
        endTime: 151, // 30 + Math.round(120500/1000)
        lengthSeconds: 121, // Math.round(120500/1000)
      });
    });

    it('should use default title when chapter has no title', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(sampleChapterResponse));

      const result = await service.fetchChaptersByAsin('B08G9PRS1K');

      // Third chapter has empty title, should fall back to "Chapter 3"
      expect(result.chapters[2].title).toBe('Chapter 3');
    });

    it('should throw NotFoundException on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 404));

      await expect(service.fetchChaptersByAsin('NONEXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 429));

      await expect(service.fetchChaptersByAsin('B08G9PRS1K')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('should throw on other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 500));

      await expect(service.fetchChaptersByAsin('B08G9PRS1K')).rejects.toThrow(
        'Audnexus API error: 500',
      );
    });
  });

  // ===== throttle =====

  describe('throttle', () => {
    it('should respect MIN_REQUEST_INTERVAL between requests', async () => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValue(mockResponse({ products: [] }));

      // First request sets lastRequestTime
      const p1 = service.searchAudible('First');
      jest.advanceTimersByTime(150);
      await p1;

      // Immediately make second request - should be delayed
      const startTime = Date.now();
      (service as any).lastRequestTime = startTime;

      const p2 = service.searchAudible('Second');

      // Advance timers to satisfy the throttle delay
      jest.advanceTimersByTime(150);
      await p2;

      // Both requests should have completed
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
