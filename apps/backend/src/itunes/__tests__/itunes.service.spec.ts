import { ItunesService } from '../itunes.service';

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

describe('ItunesService', () => {
  let service: ItunesService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    service = new ItunesService();
    // Reset internal throttle state by accessing private field
    (service as any).lastRequestTime = 0;
  });

  describe('search', () => {
    const sampleAudiobook = {
      wrapperType: 'audiobook',
      collectionId: 1442351802,
      artistName: 'Brandon Sanderson',
      collectionName: 'The Way of Kings',
      description: '<p>An epic fantasy.</p>',
      primaryGenreName: 'Sci-Fi & Fantasy',
      releaseDate: '2010-08-31T07:00:00Z',
      artworkUrl100:
        'https://is1-ssl.mzstatic.com/image/thumb/cover/100x100bb.jpg',
    };

    const sampleEbook = {
      wrapperType: 'track',
      kind: 'ebook',
      trackId: 597700745,
      artistName: 'Andy Weir',
      trackName: 'The Martian',
      description: '<p>Stranded on Mars.</p>',
      genres: ['Sci-Fi & Fantasy', 'Books', 'Fiction & Literature'],
      releaseDate: '2014-02-11T08:00:00Z',
      artworkUrl100:
        'https://is1-ssl.mzstatic.com/image/thumb/ebook/100x100bb.jpg',
      artworkUrl600:
        'https://is1-ssl.mzstatic.com/image/thumb/ebook/600x600bb.jpg',
    };

    it('should build the search URL with audiobook media and entity by default', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 0, results: [] }),
      );

      await service.search('Test Title');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://itunes.apple.com/search');
      const params = new URLSearchParams(calledUrl.split('?')[1]);
      expect(params.get('term')).toBe('Test Title');
      expect(params.get('media')).toBe('audiobook');
      expect(params.get('entity')).toBe('audiobook');
      expect(params.get('country')).toBe('US');
      expect(params.get('limit')).toBe('20');
    });

    it('should use ebook media and entity when requested', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 0, results: [] }),
      );

      await service.search('Test', 'ebook', 'SE');

      const params = new URLSearchParams(
        (mockFetch.mock.calls[0][0] as string).split('?')[1],
      );
      expect(params.get('media')).toBe('ebook');
      expect(params.get('entity')).toBe('ebook');
      expect(params.get('country')).toBe('SE');
    });

    it('should map audiobook fields correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 1, results: [sampleAudiobook] }),
      );

      const results = await service.search('The Way of Kings');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 1442351802,
        title: 'The Way of Kings',
        author: 'Brandon Sanderson',
        description: '<p>An epic fantasy.</p>',
        genres: ['Sci-Fi & Fantasy'],
        releaseDate: '2010-08-31T07:00:00Z',
        coverUrl:
          'https://is1-ssl.mzstatic.com/image/thumb/cover/600x600bb.jpg',
      });
    });

    it('should map ebook fields correctly and filter the generic Books genre', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 1, results: [sampleEbook] }),
      );

      const results = await service.search('The Martian', 'ebook');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 597700745,
        title: 'The Martian',
        author: 'Andy Weir',
        description: '<p>Stranded on Mars.</p>',
        genres: ['Sci-Fi & Fantasy', 'Fiction & Literature'],
        releaseDate: '2014-02-11T08:00:00Z',
        coverUrl:
          'https://is1-ssl.mzstatic.com/image/thumb/ebook/600x600bb.jpg',
      });
    });

    it('should prefer artworkUrl600 over the rewritten artworkUrl100', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          resultCount: 1,
          results: [
            { ...sampleAudiobook, artworkUrl600: 'https://img/600.jpg' },
          ],
        }),
      );

      const results = await service.search('Test');

      expect(results[0].coverUrl).toBe('https://img/600.jpg');
    });

    it('should omit coverUrl when no artwork is available', async () => {
      const noArtwork = { ...sampleAudiobook, artworkUrl100: undefined };
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 1, results: [noArtwork] }),
      );

      const results = await service.search('Test');

      expect(results[0].coverUrl).toBeUndefined();
    });

    it('should strip the "(Unabridged)" suffix from audiobook titles', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          resultCount: 1,
          results: [
            {
              ...sampleAudiobook,
              collectionName: 'Project Hail Mary (Unabridged)',
            },
          ],
        }),
      );

      const results = await service.search('Project Hail Mary');

      expect(results[0].title).toBe('Project Hail Mary');
    });

    it('should skip results without a title', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          resultCount: 2,
          results: [{ collectionId: 1 }, sampleAudiobook],
        }),
      );

      const results = await service.search('Test');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('The Way of Kings');
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ resultCount: 0, results: [] }),
      );

      const results = await service.search('Nonexistent');

      expect(results).toEqual([]);
    });

    it('should throw on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 429));

      await expect(service.search('Test')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('should treat 403 as rate limiting', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 403));

      await expect(service.search('Test')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('should throw on other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(null, 500));

      await expect(service.search('Test')).rejects.toThrow(
        'iTunes API error: 500',
      );
    });
  });
});
