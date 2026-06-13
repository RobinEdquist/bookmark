import { ComicVineApiClient, ComicVineApiError } from '../comicvine-api.client';

// ---------------------------------------------------------------------------
// Helpers: craft Response-like objects the same way NestJS tests do
// ---------------------------------------------------------------------------

function makeResponse(
  body: unknown,
  status = 200,
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const API_KEY = 'TEST_KEY';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOLUME_1 = {
  id: 123,
  name: 'Batman',
  start_year: '1940',
  publisher: { name: 'DC Comics' },
  count_of_issues: 200,
  description: 'The Dark Knight',
  image: { medium_url: 'https://example.com/batman.jpg' },
  site_detail_url: 'https://comicvine.gamespot.com/batman/4050-123/',
};

const VOLUME_2 = {
  id: 456,
  name: 'Superman',
  start_year: '1939',
  publisher: { name: 'DC Comics' },
  count_of_issues: 150,
  description: 'Man of Steel',
  image: { medium_url: 'https://example.com/superman.jpg' },
  site_detail_url: 'https://comicvine.gamespot.com/superman/4050-456/',
};

const ISSUE_1 = {
  id: 789,
  issue_number: '1',
  name: 'Issue One',
  cover_date: '1940-04-01',
  store_date: null,
  volume: { id: 123, name: 'Batman' },
  person_credits: [{ name: 'Bob Kane', role: 'Writer' }],
  character_credits: [{ name: 'Batman' }],
  story_arc_credits: [{ name: 'Year One' }],
  description: 'First issue',
  image: { medium_url: 'https://example.com/batman-1.jpg' },
  site_detail_url: 'https://comicvine.gamespot.com/batman-1/4000-789/',
};

function listEnvelope(results: unknown[], total = results.length) {
  return {
    status_code: 1,
    error: 'OK',
    number_of_total_results: total,
    number_of_page_results: (results as unknown[]).length,
    limit: 10,
    offset: 0,
    results,
  };
}

function singleEnvelope(result: unknown) {
  return {
    status_code: 1,
    error: 'OK',
    number_of_total_results: 1,
    number_of_page_results: 1,
    limit: 1,
    offset: 0,
    results: result,
  };
}

function errorEnvelope(statusCode: number, error: string) {
  return {
    status_code: statusCode,
    error,
    number_of_total_results: 0,
    number_of_page_results: 0,
    limit: 1,
    offset: 0,
    results: null,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ComicVineApiClient', () => {
  let mockFetch: jest.Mock;
  let client: ComicVineApiClient;

  beforeEach(() => {
    mockFetch = jest.fn();
    client = new ComicVineApiClient(API_KEY, mockFetch as typeof fetch);
  });

  // -------------------------------------------------------------------------
  // searchVolumes
  // -------------------------------------------------------------------------

  describe('searchVolumes', () => {
    it('builds the correct URL including format, field_list, filter, limit and offset', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse(listEnvelope([VOLUME_1, VOLUME_2], 2)),
      );

      await client.searchVolumes('batman', { page: 1, limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.origin + url.pathname).toBe(
        'https://comicvine.gamespot.com/api/volumes/',
      );
      expect(url.searchParams.get('api_key')).toBe(API_KEY);
      expect(url.searchParams.get('format')).toBe('json');
      const fieldList = url.searchParams.get('field_list')!;
      expect(fieldList).toBeTruthy();
      expect(fieldList).toContain('id');
      expect(fieldList).toContain('name');
      expect(fieldList).toContain('start_year');
      expect(url.searchParams.get('filter')).toBe('name:batman');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('offset')).toBe('0'); // page 1 → offset 0
    });

    it('computes offset correctly for page > 1', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([], 50)));

      await client.searchVolumes('batman', { page: 3, limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('offset')).toBe('20'); // (3-1)*10
    });

    it('sends a non-empty User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([VOLUME_1])));

      await client.searchVolumes('batman', { page: 1, limit: 10 });

      const calledHeaders = mockFetch.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(calledHeaders).toBeDefined();
      expect(calledHeaders['User-Agent']).toBeTruthy();
      expect(calledHeaders['User-Agent'].length).toBeGreaterThan(0);
    });

    it('returns totalResults and results array from a list envelope', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse(listEnvelope([VOLUME_1, VOLUME_2], 42)),
      );

      const result = await client.searchVolumes('batman', {
        page: 1,
        limit: 10,
      });

      expect(result.totalResults).toBe(42);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual(VOLUME_1);
    });
  });

  // -------------------------------------------------------------------------
  // getVolume — id prefix encapsulation
  // -------------------------------------------------------------------------

  describe('getVolume', () => {
    it('builds the path /api/volume/4050-{id}/ with correct params', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(singleEnvelope(VOLUME_1)));

      await client.getVolume(123);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe('/api/volume/4050-123/');
      expect(url.searchParams.get('api_key')).toBe(API_KEY);
      expect(url.searchParams.get('format')).toBe('json');
      const fieldList = url.searchParams.get('field_list')!;
      expect(fieldList).toBeTruthy();
      expect(fieldList).toContain('id');
      expect(fieldList).toContain('name');
    });

    it('returns the single-resource results object (not wrapped in an array)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(singleEnvelope(VOLUME_1)));

      const result = await client.getVolume(123);

      // result is the raw volume object
      expect(result.results).toEqual(VOLUME_1);
    });
  });

  // -------------------------------------------------------------------------
  // getVolumeIssues
  // -------------------------------------------------------------------------

  describe('getVolumeIssues', () => {
    it('builds the /api/issues/ URL filtered by volume id', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([ISSUE_1], 1)));

      await client.getVolumeIssues(123, { page: 1, limit: 20 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe('/api/issues/');
      expect(url.searchParams.get('filter')).toBe('volume:123');
      const fieldList = url.searchParams.get('field_list')!;
      expect(fieldList).toBeTruthy();
      expect(fieldList).toContain('id');
      expect(fieldList).toContain('name');
      expect(fieldList).toContain('issue_number');
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('offset')).toBe('0');
    });

    it('returns totalResults and results from the list envelope', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([ISSUE_1], 5)));

      const result = await client.getVolumeIssues(123, { page: 1, limit: 20 });

      expect(result.totalResults).toBe(5);
      expect(result.results).toEqual([ISSUE_1]);
    });
  });

  // -------------------------------------------------------------------------
  // searchIssues
  // -------------------------------------------------------------------------

  describe('searchIssues', () => {
    it('builds the /api/issues/ URL with name filter and correct field_list', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([ISSUE_1])));

      await client.searchIssues('batman 1', { page: 1, limit: 10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe('/api/issues/');
      expect(url.searchParams.get('filter')).toBe('name:batman 1');
      const fieldList = url.searchParams.get('field_list')!;
      expect(fieldList).toBeTruthy();
      expect(fieldList).toContain('id');
      expect(fieldList).toContain('name');
      expect(fieldList).toContain('issue_number');
    });

    it('returns totalResults and results from the list envelope', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(listEnvelope([ISSUE_1], 7)));

      const result = await client.searchIssues('batman', {
        page: 1,
        limit: 10,
      });

      expect(result.totalResults).toBe(7);
      expect(result.results[0]).toEqual(ISSUE_1);
    });
  });

  // -------------------------------------------------------------------------
  // getIssue — id prefix encapsulation
  // -------------------------------------------------------------------------

  describe('getIssue', () => {
    it('builds the path /api/issue/4000-{id}/ with correct params', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(singleEnvelope(ISSUE_1)));

      await client.getIssue(789);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);

      expect(url.pathname).toBe('/api/issue/4000-789/');
      expect(url.searchParams.get('api_key')).toBe(API_KEY);
      expect(url.searchParams.get('format')).toBe('json');
      const fieldList = url.searchParams.get('field_list')!;
      expect(fieldList).toBeTruthy();
      expect(fieldList).toContain('id');
      expect(fieldList).toContain('name');
      expect(fieldList).toContain('issue_number');
    });

    it('returns the single-resource results object', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(singleEnvelope(ISSUE_1)));

      const result = await client.getIssue(789);

      expect(result.results).toEqual(ISSUE_1);
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe('error mapping', () => {
    it('throws ComicVineApiError with code 100 for invalid API key', async () => {
      // assert a throw is actually observed (a bare try/catch would silently
      // pass if the call never threw)
      expect.assertions(4);

      mockFetch.mockResolvedValue(
        makeResponse(errorEnvelope(100, 'Invalid API Key')),
      );

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow(ComicVineApiError);

      await client
        .searchVolumes('batman', { page: 1, limit: 10 })
        .catch((err) => {
          expect(err).toBeInstanceOf(ComicVineApiError);
          expect((err as ComicVineApiError).code).toBe(100);
          expect((err as ComicVineApiError).rateLimited).toBe(false);
        });
    });

    it('throws ComicVineApiError with code 101 for object not found', async () => {
      expect.assertions(4);

      mockFetch.mockResolvedValue(
        makeResponse(errorEnvelope(101, 'Object Not Found')),
      );

      await expect(client.getVolume(9999)).rejects.toThrow(ComicVineApiError);

      await client.getVolume(9999).catch((err) => {
        expect(err).toBeInstanceOf(ComicVineApiError);
        expect((err as ComicVineApiError).code).toBe(101);
        expect((err as ComicVineApiError).rateLimited).toBe(false);
      });
    });

    it('throws ComicVineApiError with rateLimited=true on HTTP 420', async () => {
      expect.assertions(3);

      mockFetch.mockResolvedValue(makeResponse({}, 420));

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow(ComicVineApiError);

      await client
        .searchVolumes('batman', { page: 1, limit: 10 })
        .catch((err) => {
          expect(err).toBeInstanceOf(ComicVineApiError);
          expect((err as ComicVineApiError).rateLimited).toBe(true);
        });
    });

    it('throws ComicVineApiError with rateLimited=true on HTTP 429', async () => {
      expect.assertions(3);

      mockFetch.mockResolvedValue(makeResponse({}, 429));

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow(ComicVineApiError);

      await client
        .searchVolumes('batman', { page: 1, limit: 10 })
        .catch((err) => {
          expect(err).toBeInstanceOf(ComicVineApiError);
          expect((err as ComicVineApiError).rateLimited).toBe(true);
        });
    });

    it('throws a ComicVineApiError on other non-ok HTTP statuses', async () => {
      expect.assertions(1);

      mockFetch.mockResolvedValueOnce(makeResponse({}, 503));

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow(ComicVineApiError);
    });

    it('wraps network errors (fetchImpl rejects) in a thrown error', async () => {
      expect.assertions(1);

      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow();
    });

    it('throws ComicVineApiError on status_code 104 (filter error)', async () => {
      expect.assertions(3);

      mockFetch.mockResolvedValue(
        makeResponse(errorEnvelope(104, 'Invalid filter')),
      );

      await expect(
        client.searchVolumes('batman', { page: 1, limit: 10 }),
      ).rejects.toThrow(ComicVineApiError);

      await client
        .searchVolumes('batman', { page: 1, limit: 10 })
        .catch((err) => {
          expect(err).toBeInstanceOf(ComicVineApiError);
          expect((err as ComicVineApiError).code).toBe(104);
        });
    });
  });

  // -------------------------------------------------------------------------
  // User-Agent sent on every method
  // -------------------------------------------------------------------------

  describe('User-Agent header', () => {
    it.each([
      ['getVolume', () => client.getVolume(123)],
      [
        'getVolumeIssues',
        () => client.getVolumeIssues(123, { page: 1, limit: 10 }),
      ],
      [
        'searchIssues',
        () => client.searchIssues('batman', { page: 1, limit: 10 }),
      ],
      ['getIssue', () => client.getIssue(789)],
    ])('%s sends a non-empty User-Agent header', async (_name, callFn) => {
      mockFetch.mockResolvedValue(makeResponse(singleEnvelope(VOLUME_1)));
      await callFn().catch(() => {
        // some may parse the body differently — errors are fine, we just
        // want to inspect the headers
      });
      const calledHeaders = mockFetch.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(calledHeaders?.['User-Agent']).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // format=json always present
  // -------------------------------------------------------------------------

  describe('format=json always present', () => {
    it.each([
      ['searchVolumes', () => client.searchVolumes('x', { page: 1, limit: 5 })],
      ['getVolume', () => client.getVolume(1)],
      [
        'getVolumeIssues',
        () => client.getVolumeIssues(1, { page: 1, limit: 5 }),
      ],
      ['searchIssues', () => client.searchIssues('x', { page: 1, limit: 5 })],
      ['getIssue', () => client.getIssue(1)],
    ])('%s includes format=json', async (_name, callFn) => {
      mockFetch.mockResolvedValue(makeResponse(singleEnvelope(VOLUME_1)));
      await callFn().catch(() => {});
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('format')).toBe('json');
      mockFetch.mockClear();
    });
  });
});
