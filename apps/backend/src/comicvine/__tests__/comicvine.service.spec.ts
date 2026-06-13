import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { ComicvineService } from '../comicvine.service';
import { ComicVineApiClient, ComicVineApiError } from '../comicvine-api.client';
import type { CvVolumeRaw, CvIssueRaw } from '../dto/comicvine.dto';

// ---------------------------------------------------------------------------
// Module mocks — prevent real EventsGateway / WsEventsService from loading
// ---------------------------------------------------------------------------

jest.mock('../../events/events.gateway', () => ({
  EventsGateway: jest.fn(),
}));
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Fake ComicVineApiClient
// ---------------------------------------------------------------------------

const mockSearchVolumes = jest.fn();
const mockGetVolume = jest.fn();
const mockGetVolumeIssues = jest.fn();
const mockSearchIssues = jest.fn();
const mockGetIssue = jest.fn();

class FakeComicVineApiClient {
  searchVolumes = mockSearchVolumes;
  getVolume = mockGetVolume;
  getVolumeIssues = mockGetVolumeIssues;
  searchIssues = mockSearchIssues;
  getIssue = mockGetIssue;
}

// ---------------------------------------------------------------------------
// Testable subclass — overrides createClient to return the fake
// ---------------------------------------------------------------------------

class TestableComicvineService extends ComicvineService {
  protected createClient(_apiKey: string): ComicVineApiClient {
    return new FakeComicVineApiClient() as unknown as ComicVineApiClient;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAppEvents() {
  return {
    comicvineSyncCompleted: jest.fn(),
    comicSeriesUpdated: jest.fn(),
  };
}

function createMockWsEvents() {
  return {
    comicvineSyncStatusUpdated: jest.fn(),
    comicBookUpdated: jest.fn(),
  };
}

/**
 * Build a mock insert chain for an upsertVolume/upsertIssue call that now uses
 * `insert(...).values(...).onConflictDoUpdate(...).returning()` (single
 * round-trip). `returning()` resolves to `[row]`.
 */
function createUpsertChain(row: unknown) {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockResolvedValueOnce([row]);
  return chain;
}

function buildCvVolume(overrides: Partial<CvVolumeRaw> = {}): CvVolumeRaw {
  return {
    id: 12345,
    name: 'X-Men',
    start_year: 1963,
    publisher: { name: 'Marvel' },
    count_of_issues: 66,
    description: 'The original X-Men series.',
    image: { medium_url: 'https://comicvine.com/images/xmen.jpg' },
    site_detail_url: 'https://comicvine.gamespot.com/x-men/4050-12345/',
    ...overrides,
  };
}

function buildCvIssue(overrides: Partial<CvIssueRaw> = {}): CvIssueRaw {
  return {
    id: 99001,
    issue_number: '1',
    name: 'X-Men #1',
    cover_date: '1963-09-01',
    store_date: null,
    volume: { id: 12345, name: 'X-Men' },
    person_credits: [{ name: 'Stan Lee', role: 'writer' }],
    character_credits: [{ name: 'Cyclops' }],
    story_arc_credits: [],
    description: 'First issue.',
    image: { medium_url: 'https://comicvine.com/images/xmen1.jpg' },
    site_detail_url: 'https://comicvine.gamespot.com/x-men-1/4000-99001/',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComicvineService', () => {
  let db: MockDb;
  let mockAppEvents: ReturnType<typeof createMockAppEvents>;
  let mockWsEvents: ReturnType<typeof createMockWsEvents>;
  let service: TestableComicvineService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createMockDb();
    mockAppEvents = createMockAppEvents();
    mockWsEvents = createMockWsEvents();
    service = new TestableComicvineService(
      db as any,
      mockAppEvents as any,
      mockWsEvents as any,
    );
  });

  // =========================================================================
  // API Key Management
  // =========================================================================

  describe('getApiKey', () => {
    it('returns the stored API key', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ comicvineApiKey: 'cv-key-abc' }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getApiKey();
      expect(result).toBe('cv-key-abc');
    });

    it('returns null when no key is set', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ comicvineApiKey: null }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getApiKey();
      expect(result).toBeNull();
    });
  });

  describe('setApiKey', () => {
    it('updates the settings row with the new key', async () => {
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.setApiKey('new-cv-key');

      expect(db.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        comicvineApiKey: 'new-cv-key',
      });
    });
  });

  // =========================================================================
  // validateApiKey
  // =========================================================================

  describe('validateApiKey', () => {
    it('returns valid: true on a successful search call', async () => {
      mockSearchVolumes.mockResolvedValueOnce({
        totalResults: 1,
        results: [buildCvVolume()],
      });

      const result = await service.validateApiKey('good-key');
      expect(result).toEqual({ valid: true });
    });

    it('maps ComicVineApiError code 100 → valid: false (invalid key)', async () => {
      mockSearchVolumes.mockRejectedValueOnce(
        new ComicVineApiError(100, 'Invalid API Key'),
      );

      const result = await service.validateApiKey('bad-key');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid api key/i);
    });

    it('maps rate-limited ComicVineApiError → valid: false with rate-limit message', async () => {
      mockSearchVolumes.mockRejectedValueOnce(
        new ComicVineApiError(0, 'rate limited', true),
      );

      const result = await service.validateApiKey('any-key');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/rate limit/i);
    });

    it('maps non-ComicVine Error → valid: false with the error message', async () => {
      mockSearchVolumes.mockRejectedValueOnce(new Error('Network failure'));

      const result = await service.validateApiKey('key');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('maps unknown thrown value → valid: false with fallback message', async () => {
      mockSearchVolumes.mockRejectedValueOnce('string error');

      const result = await service.validateApiKey('key');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/failed to connect/i);
    });
  });

  // =========================================================================
  // getAutoSyncOnImport / setAutoSyncOnImport
  // =========================================================================

  describe('getAutoSyncOnImport', () => {
    it('returns the stored boolean', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ autoSyncOnImport: true }]);
      db.select.mockReturnValueOnce(chain);

      expect(await service.getAutoSyncOnImport()).toBe(true);
    });

    it('returns false when no row found', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(chain);

      expect(await service.getAutoSyncOnImport()).toBe(false);
    });
  });

  // =========================================================================
  // upsertVolume
  // =========================================================================

  describe('upsertVolume', () => {
    it('upserts via a single insert...onConflictDoUpdate...returning and returns the row', async () => {
      const row = {
        id: 'uuid-vol-1',
        comicvineVolumeId: 12345,
        name: 'X-Men',
      };
      const upsertChain = createUpsertChain(row);
      db.insert.mockReturnValueOnce(upsertChain);

      const result = await service.upsertVolume(buildCvVolume());

      expect(result).toEqual(row);
      // One round-trip: no pre-select, no separate update
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.select).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
      expect(upsertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    });

    it('parses a string start_year into a number', async () => {
      const row = { id: 'uuid-vol-2', comicvineVolumeId: 99, name: 'Saga' };
      const upsertChain = createUpsertChain(row);
      db.insert.mockReturnValueOnce(upsertChain);

      await service.upsertVolume(buildCvVolume({ start_year: '2012' }));

      expect(upsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ startYear: 2012 }),
      );
    });
  });

  // =========================================================================
  // matchSeries — cvinfo pin auto-link
  // =========================================================================

  describe('matchSeries — cvinfo pin', () => {
    it('fetches the pinned volume and links it directly without confidence check', async () => {
      // getApiKey → key present
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load series with comicvineVolumeId pin
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'series-1',
          title: 'X-Men',
          startYear: 1963,
          comicvineVolumeId: 12345,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      // getVolume from API
      const cvVolume = buildCvVolume();
      mockGetVolume.mockResolvedValueOnce({
        totalResults: 1,
        results: cvVolume,
      });

      // linkSeriesToVolume internal calls:
      // upsertVolume: single insert...onConflictDoUpdate...returning
      const cachedVol = { id: 'cached-vol-uuid', comicvineVolumeId: 12345 };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedVol));

      // delete existing link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      // insert new link
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);

      // update series comicvineVolumeId
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.matchSeries('series-1');

      expect(result.outcome).toBe('linked');
      expect((result as { outcome: 'linked'; cvId: number }).cvId).toBe(12345);
      expect(mockGetVolume).toHaveBeenCalledWith(12345);
      // searchVolumes should NOT have been called (pin bypass)
      expect(mockSearchVolumes).not.toHaveBeenCalled();
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'series',
        'series-1',
      );
    });
  });

  // =========================================================================
  // matchSeries — name+year single confident match → links
  // =========================================================================

  describe('matchSeries — name+year confident auto-link', () => {
    it('auto-links when a single candidate has matching name and year', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load series — no pin
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'series-2',
          title: 'Amazing Spider-Man',
          startYear: 1963,
          comicvineVolumeId: null,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      // searchVolumes API call returns one matching candidate
      const cvVolume = buildCvVolume({
        id: 99,
        name: 'Amazing Spider-Man',
        start_year: 1963,
        count_of_issues: 441,
      });
      mockSearchVolumes.mockResolvedValueOnce({
        totalResults: 1,
        results: [cvVolume],
      });

      // linkSeriesToVolume: upsertVolume single-round-trip upsert
      const cachedVol = { id: 'cached-asm-uuid', comicvineVolumeId: 99 };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedVol));

      // delete old link
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);

      // insert new link
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);

      // update series
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.matchSeries('series-2');

      expect(result.outcome).toBe('linked');
      expect(mockSearchVolumes).toHaveBeenCalledWith('Amazing Spider-Man', {
        page: 1,
        limit: 20,
      });
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'series',
        'series-2',
      );
    });

    it('recovers the matched candidate by ComicVine id, not by name string', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Series with a startYear that makes exactly ONE candidate auto-linkable.
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'series-3',
          title: 'Daredevil',
          startYear: 1998,
          comicvineVolumeId: null,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      // Two same-NAME candidates with different ids and years. Only the 1998
      // volume (id 222) is auto-linkable; the 1964 one (id 111) is not.
      // Recovery must use id 222 — a name lookup could grab the wrong row.
      mockSearchVolumes.mockResolvedValueOnce({
        totalResults: 2,
        results: [
          buildCvVolume({
            id: 111,
            name: 'Daredevil',
            start_year: 1964,
            count_of_issues: 380,
          }),
          buildCvVolume({
            id: 222,
            name: 'Daredevil',
            start_year: 1998,
            count_of_issues: 119,
          }),
        ],
      });

      // linkSeriesToVolume upsert
      const cachedVol = { id: 'cached-dd-uuid', comicvineVolumeId: 222 };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedVol));
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.matchSeries('series-3');

      expect(result.outcome).toBe('linked');
      // The pin written must be the 1998 volume's id (222), proving id-based recovery
      expect((result as { outcome: 'linked'; cvId: number }).cvId).toBe(222);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ comicvineVolumeId: 222 }),
      );
    });
  });

  // =========================================================================
  // matchSeries — ambiguous (multiple auto-linkable) → needs_review
  // =========================================================================

  describe('matchSeries — ambiguous candidates → needs_review', () => {
    it('returns needs_review and does NOT link when multiple auto-linkable volumes', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load series — no pin, no startYear so scores are title-only (not auto-linkable)
      // To test ambiguous: two volumes with SAME name and SAME year
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'series-xmen',
          title: 'X-Men',
          startYear: 1991,
          comicvineVolumeId: null,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      // Two X-Men volumes, both start_year 1991 → both auto-linkable → ambiguous
      mockSearchVolumes.mockResolvedValueOnce({
        totalResults: 2,
        results: [
          buildCvVolume({
            id: 111,
            name: 'X-Men',
            start_year: 1991,
            count_of_issues: 50,
          }),
          buildCvVolume({
            id: 222,
            name: 'X-Men',
            start_year: 1991,
            count_of_issues: 30,
          }),
        ],
      });

      const result = await service.matchSeries('series-xmen');

      expect(result.outcome).toBe('needs_review');
      // Crucially: no insert, no update, no event
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
      expect(mockAppEvents.comicvineSyncCompleted).not.toHaveBeenCalled();
    });

    it('returns needs_review when no search results found', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'series-noresult',
          title: 'Obscure Comic',
          startYear: 2001,
          comicvineVolumeId: null,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      mockSearchVolumes.mockResolvedValueOnce({ totalResults: 0, results: [] });

      const result = await service.matchSeries('series-noresult');
      expect(result.outcome).toBe('needs_review');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns needs_review when no API key is configured', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([{ comicvineApiKey: null }]);
      db.select.mockReturnValueOnce(settingsChain);

      const result = await service.matchSeries('series-any');
      expect(result.outcome).toBe('no_api_key');
    });

    it('throws NotFoundException when series does not exist', async () => {
      expect.assertions(1);

      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(seriesChain);

      await expect(service.matchSeries('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // matchBook — issue number match
  // =========================================================================

  describe('matchBook', () => {
    it('links the book when issue number matches in the linked volume', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load book
      const bookChain = createChainMock(['from', 'where', 'limit']);
      bookChain.limit.mockResolvedValueOnce([
        {
          id: 'book-1',
          seriesId: 'series-1',
          number: '1',
          coverDate: '1963-09-01',
        },
      ]);
      db.select.mockReturnValueOnce(bookChain);

      // Volume link check
      const volLinkChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      volLinkChain.limit.mockResolvedValueOnce([
        { comicvineVolumeRowId: 'vol-uuid', comicvineVolumeId: 12345 },
      ]);
      db.select.mockReturnValueOnce(volLinkChain);

      // getVolumeIssuesPaged calls getClient (getApiKey again)
      const settingsChain2 = createChainMock(['from', 'where', 'limit']);
      settingsChain2.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain2);

      // getVolumeIssues API call returns one issue matching number "1"
      const cvIssue = buildCvIssue({ id: 99001, issue_number: '1' });
      mockGetVolumeIssues.mockResolvedValueOnce({
        totalResults: 1,
        results: [cvIssue],
      });

      const cachedIssue = {
        id: 'cached-issue-uuid',
        comicvineIssueId: 99001,
        issueNumber: '1',
        coverDate: '1963-09-01',
        storeDate: null,
        name: 'X-Men #1',
        description: 'First issue.',
        imageUrl: 'https://comicvine.com/images/xmen1.jpg',
        siteDetailUrl: 'https://comicvine.gamespot.com/x-men-1/4000-99001/',
        personCredits: [{ name: 'Stan Lee', role: 'writer' }],
        characterCredits: ['Cyclops'],
        storyArcCredits: [],
        comicvineVolumeId: 12345,
        syncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // upsertIssue is called TWICE — each is now a single
      // insert...onConflictDoUpdate...returning round-trip:
      //   1. From getVolumeIssuesPaged (caches the issue)
      //   2. From linkBookToIssue (re-upserts the raw shape built from bestMatch)
      db.insert.mockReturnValueOnce(createUpsertChain(cachedIssue)); // call 1
      db.insert.mockReturnValueOnce(createUpsertChain(cachedIssue)); // call 2

      // linkBookToIssue: delete old link
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);

      // linkBookToIssue: insert new link
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);

      // linkBookToIssue: update book comicvineIssueId
      const bookUpdateChain = createChainMock(['set', 'where']);
      bookUpdateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(bookUpdateChain);

      const result = await service.matchBook('book-1');

      expect(result.outcome).toBe('linked');
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'book',
        'book-1',
      );
    });

    it('returns needs_review when parent series has no volume link', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      const bookChain = createChainMock(['from', 'where', 'limit']);
      bookChain.limit.mockResolvedValueOnce([
        {
          id: 'book-2',
          seriesId: 'series-unlinked',
          number: '5',
          coverDate: null,
        },
      ]);
      db.select.mockReturnValueOnce(bookChain);

      // No volume link
      const volLinkChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      volLinkChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(volLinkChain);

      const result = await service.matchBook('book-2');
      expect(result.outcome).toBe('needs_review');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when book does not exist', async () => {
      expect.assertions(1);

      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      const bookChain = createChainMock(['from', 'where', 'limit']);
      bookChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(bookChain);

      await expect(service.matchBook('nonexistent-book')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // linkSeriesToVolume / unlinkSeries
  // =========================================================================

  describe('linkSeriesToVolume', () => {
    it('upserts volume, deletes old link, inserts new link, updates pin, emits event', async () => {
      // upsertVolume: single-round-trip upsert
      const cachedVol = { id: 'vol-uuid', comicvineVolumeId: 12345 };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedVol));

      // delete existing link
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);

      // insert new link
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);

      // update series pin
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.linkSeriesToVolume(
        'series-test',
        buildCvVolume(),
      );

      expect(result).toEqual(cachedVol);
      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(2); // upsert + link
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ comicvineVolumeId: 12345 }),
      );
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'series',
        'series-test',
      );
    });
  });

  describe('unlinkSeries', () => {
    it('deletes the volume link and clears the series pin', async () => {
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);

      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.unlinkSeries('series-test');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ comicvineVolumeId: null }),
      );
    });
  });

  // =========================================================================
  // linkBookToIssue / unlinkBook
  // =========================================================================

  describe('unlinkBook', () => {
    it('deletes the issue link and clears the book pin', async () => {
      const delChain = createChainMock(['where']);
      delChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(delChain);

      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.unlinkBook('book-test');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ comicvineIssueId: null }),
      );
      // Symmetric with unlinkSeries: a comic-book update event is emitted
      expect(mockWsEvents.comicBookUpdated).toHaveBeenCalledWith('book-test');
    });
  });

  // =========================================================================
  // Sync Queue
  // =========================================================================

  describe('addToSyncQueue', () => {
    it('inserts a series queue item when not already queued or linked', async () => {
      // Promise.all: queue check + link check
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([]); // not in queue
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([]); // not linked
      db.select.mockReturnValueOnce(linkCheck);

      // insert queue item
      const insertChain = createChainMock(['values']);
      insertChain.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(insertChain);

      // emitComicvineSyncStatus: two selects (pending + needs_review/failed)
      const pendingChain = createChainMock(['from', 'where']);
      pendingChain.where.mockResolvedValueOnce([{ id: 'q1' }]);
      db.select.mockReturnValueOnce(pendingChain);

      const reviewFailedChain = createChainMock(['from', 'where']);
      reviewFailedChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(reviewFailedChain);

      const inserted = await service.addToSyncQueue('series', 'series-1');
      await new Promise(process.nextTick); // flush async emit

      expect(inserted).toBe(true);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockWsEvents.comicvineSyncStatusUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ pendingCount: 1 }),
      );
    });

    it('skips and returns false when series is already in queue', async () => {
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([{ id: 'existing' }]);
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(linkCheck);

      const inserted = await service.addToSyncQueue('series', 'series-1');
      expect(inserted).toBe(false);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('skips and returns false when series is already linked', async () => {
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([{ seriesId: 'series-1' }]);
      db.select.mockReturnValueOnce(linkCheck);

      const inserted = await service.addToSyncQueue('series', 'series-1');
      expect(inserted).toBe(false);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts a book queue item when not already queued or linked', async () => {
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(linkCheck);

      const insertChain = createChainMock(['values']);
      insertChain.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(insertChain);

      // emitComicvineSyncStatus
      const pendingChain = createChainMock(['from', 'where']);
      pendingChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(pendingChain);
      const rfChain = createChainMock(['from', 'where']);
      rfChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(rfChain);

      await service.addToSyncQueue('book', 'book-1');
      await new Promise(process.nextTick);

      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('markNeedsReview', () => {
    it('updates queue item status to needs_review with reason', async () => {
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.markNeedsReview('q-1', 'Ambiguous candidates');

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'needs_review',
        errorMessage: 'Ambiguous candidates',
      });
    });
  });

  describe('getPendingCount', () => {
    it('returns the pending count from a count(*) projection', async () => {
      const chain = createChainMock(['from', 'where']);
      // count(*) projection resolves to a single row { count }
      chain.where.mockResolvedValueOnce([{ count: 2 }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getPendingCount();
      expect(result).toBe(2);
    });

    it('coerces a string count (pg bigint) to a number', async () => {
      const chain = createChainMock(['from', 'where']);
      chain.where.mockResolvedValueOnce([{ count: '5' }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getPendingCount();
      expect(result).toBe(5);
    });
  });

  describe('dismissItem', () => {
    it('deletes a failed or needs_review queue item by id', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      await service.dismissItem('q-failed');
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('queueAllUnlinkedSeries', () => {
    it('throws BadRequestException when no API key is configured', async () => {
      expect.assertions(1);

      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([{ comicvineApiKey: null }]);
      db.select.mockReturnValueOnce(settingsChain);

      await expect(service.queueAllUnlinkedSeries()).rejects.toThrow(
        BadRequestException,
      );
    });

    it('queues all unlinked series and returns count', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Find unlinked series
      const unlinkedChain = createChainMock(['from', 'leftJoin', 'where']);
      unlinkedChain.where.mockResolvedValueOnce([
        { id: 'series-a' },
        { id: 'series-b' },
      ]);
      db.select.mockReturnValueOnce(unlinkedChain);

      // addToSyncQueue for series-a
      const q1Check = createChainMock(['from', 'where', 'limit']);
      q1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q1Check);
      const l1Check = createChainMock(['from', 'where', 'limit']);
      l1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l1Check);
      const i1 = createChainMock(['values']);
      i1.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(i1);
      // emit status for a
      const p1 = createChainMock(['from', 'where']);
      p1.where.mockResolvedValueOnce([{ id: '1' }]);
      db.select.mockReturnValueOnce(p1);
      const rf1 = createChainMock(['from', 'where']);
      rf1.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(rf1);

      // addToSyncQueue for series-b
      const q2Check = createChainMock(['from', 'where', 'limit']);
      q2Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q2Check);
      const l2Check = createChainMock(['from', 'where', 'limit']);
      l2Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l2Check);
      const i2 = createChainMock(['values']);
      i2.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(i2);
      // emit status for b
      const p2 = createChainMock(['from', 'where']);
      p2.where.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      db.select.mockReturnValueOnce(p2);
      const rf2 = createChainMock(['from', 'where']);
      rf2.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(rf2);

      const result = await service.queueAllUnlinkedSeries();
      expect(result).toBe(2);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('counts only rows actually inserted (skips do not inflate the count)', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Find two candidate series
      const unlinkedChain = createChainMock(['from', 'leftJoin', 'where']);
      unlinkedChain.where.mockResolvedValueOnce([
        { id: 'series-a' },
        { id: 'series-b' },
      ]);
      db.select.mockReturnValueOnce(unlinkedChain);

      // series-a → inserts (returns true)
      const q1Check = createChainMock(['from', 'where', 'limit']);
      q1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q1Check);
      const l1Check = createChainMock(['from', 'where', 'limit']);
      l1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l1Check);
      const i1 = createChainMock(['values']);
      i1.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(i1);
      const p1 = createChainMock(['from', 'where']);
      p1.where.mockResolvedValueOnce([{ id: '1' }]);
      db.select.mockReturnValueOnce(p1);
      const rf1 = createChainMock(['from', 'where']);
      rf1.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(rf1);

      // series-b → already queued → skipped (returns false, no insert)
      const q2Check = createChainMock(['from', 'where', 'limit']);
      q2Check.limit.mockResolvedValueOnce([{ id: 'already-queued' }]);
      db.select.mockReturnValueOnce(q2Check);
      const l2Check = createChainMock(['from', 'where', 'limit']);
      l2Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l2Check);

      const result = await service.queueAllUnlinkedSeries();

      // Only series-a was inserted → count is 1, not 2
      expect(result).toBe(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // mock E2E flow (api key → match series → match book)
  // =========================================================================

  describe('mock E2E flow (api key → match series → match book)', () => {
    it('returns no_api_key and never constructs the client when no key is set', async () => {
      // getApiKey → null
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([{ comicvineApiKey: null }]);
      db.select.mockReturnValueOnce(settingsChain);

      const result = await service.matchSeries('any-series-id');

      expect(result.outcome).toBe('no_api_key');
      // Client methods must never have been invoked
      expect(mockGetVolume).not.toHaveBeenCalled();
      expect(mockSearchVolumes).not.toHaveBeenCalled();
      expect(mockGetVolumeIssues).not.toHaveBeenCalled();
      // No DB writes
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('links series via cvinfo pin: bypasses search, upserts volume, inserts link row', async () => {
      // getApiKey → key present
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'e2e-cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load series with a comicvineVolumeId pin
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        {
          id: 'e2e-series-1',
          title: 'X-Men',
          startYear: 1963,
          comicvineVolumeId: 12345,
        },
      ]);
      db.select.mockReturnValueOnce(seriesChain);

      // getVolume returns the pinned volume
      const cvVolume = buildCvVolume({ id: 12345 });
      mockGetVolume.mockResolvedValueOnce({
        totalResults: 1,
        results: cvVolume,
      });

      // linkSeriesToVolume: upsertVolume (single insert…onConflictDoUpdate…returning)
      const cachedVol = { id: 'e2e-vol-uuid', comicvineVolumeId: 12345 };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedVol));

      // delete existing link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      // insert new link (comicvine_volume_links)
      const linkInsert = createChainMock(['values']);
      linkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsert);

      // update series comicvineVolumeId pin
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.matchSeries('e2e-series-1');

      // Outcome: linked with correct cvId
      expect(result.outcome).toBe('linked');
      expect((result as { outcome: 'linked'; cvId: number }).cvId).toBe(12345);

      // Pin bypasses search — searchVolumes must NOT have been called
      expect(mockSearchVolumes).not.toHaveBeenCalled();

      // getVolume WAS called with the pinned id
      expect(mockGetVolume).toHaveBeenCalledWith(12345);

      // Two inserts: one upsert for the volume cache row + one for the link row
      expect(db.insert).toHaveBeenCalledTimes(2);

      // comicvineSyncCompleted event was emitted
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'series',
        'e2e-series-1',
      );
    });

    it('links book to issue when series is already linked (volume row + link row present)', async () => {
      // getApiKey for matchBook's internal getClient call
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'e2e-cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Load book: number "1", belongs to 'e2e-series-1'
      const bookChain = createChainMock(['from', 'where', 'limit']);
      bookChain.limit.mockResolvedValueOnce([
        {
          id: 'e2e-book-1',
          seriesId: 'e2e-series-1',
          number: '1',
          coverDate: '1963-09-01',
        },
      ]);
      db.select.mockReturnValueOnce(bookChain);

      // Volume link check: series has a linked volume
      const volLinkChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      volLinkChain.limit.mockResolvedValueOnce([
        { comicvineVolumeRowId: 'e2e-vol-uuid', comicvineVolumeId: 12345 },
      ]);
      db.select.mockReturnValueOnce(volLinkChain);

      // getVolumeIssuesPaged calls getClient which calls getApiKey again
      const settingsChain2 = createChainMock(['from', 'where', 'limit']);
      settingsChain2.limit.mockResolvedValueOnce([
        { comicvineApiKey: 'e2e-cv-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain2);

      // getVolumeIssues API returns issue list including issue_number "1"
      const cvIssue = buildCvIssue({ id: 99001, issue_number: '1' });
      mockGetVolumeIssues.mockResolvedValueOnce({
        totalResults: 1,
        results: [cvIssue],
      });

      // upsertIssue call 1: from getVolumeIssuesPaged (caching all issues in the page)
      const cachedIssue = {
        id: 'e2e-issue-uuid',
        comicvineIssueId: 99001,
        issueNumber: '1',
        coverDate: '1963-09-01',
        storeDate: null,
        name: 'X-Men #1',
        description: 'First issue.',
        imageUrl: 'https://comicvine.com/images/xmen1.jpg',
        siteDetailUrl: 'https://comicvine.gamespot.com/x-men-1/4000-99001/',
        personCredits: [{ name: 'Stan Lee', role: 'writer' }],
        characterCredits: ['Cyclops'],
        storyArcCredits: [],
        comicvineVolumeId: 12345,
        syncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.insert.mockReturnValueOnce(createUpsertChain(cachedIssue)); // call 1 (getVolumeIssuesPaged)
      db.insert.mockReturnValueOnce(createUpsertChain(cachedIssue)); // call 2 (linkBookToIssue re-upsert)

      // linkBookToIssue: delete existing issue link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      // linkBookToIssue: insert new issue link (comicvine_issue_links)
      const issueLinkInsert = createChainMock(['values']);
      issueLinkInsert.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(issueLinkInsert);

      // linkBookToIssue: update book comicvineIssueId
      const bookUpdateChain = createChainMock(['set', 'where']);
      bookUpdateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(bookUpdateChain);

      const result = await service.matchBook('e2e-book-1');

      // Outcome: linked
      expect(result.outcome).toBe('linked');

      // A comicvine_issue_links insert occurred (third db.insert call)
      expect(db.insert).toHaveBeenCalledTimes(3);

      // comicvineSyncCompleted event for the book
      expect(mockAppEvents.comicvineSyncCompleted).toHaveBeenCalledWith(
        'book',
        'e2e-book-1',
      );
    });
  });

  // =========================================================================
  // cleanupOrphanedCache
  // =========================================================================

  describe('cleanupOrphanedCache', () => {
    it('deletes orphaned volumes and issues and returns counts', async () => {
      // orphaned volumes select
      const volSelectChain = createChainMock(['from', 'leftJoin', 'where']);
      volSelectChain.where.mockResolvedValueOnce([
        { id: 'orphan-vol-1' },
        { id: 'orphan-vol-2' },
      ]);
      db.select.mockReturnValueOnce(volSelectChain);

      // delete orphaned volumes
      const volDeleteChain = createChainMock(['where']);
      volDeleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(volDeleteChain);

      // orphaned issues select
      const issueSelectChain = createChainMock(['from', 'leftJoin', 'where']);
      issueSelectChain.where.mockResolvedValueOnce([{ id: 'orphan-issue-1' }]);
      db.select.mockReturnValueOnce(issueSelectChain);

      // delete orphaned issues
      const issueDeleteChain = createChainMock(['where']);
      issueDeleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(issueDeleteChain);

      const result = await service.cleanupOrphanedCache();
      expect(result).toEqual({ volumes: 2, issues: 1 });
      expect(db.delete).toHaveBeenCalledTimes(2);
    });

    it('returns 0 counts when no orphans exist', async () => {
      const volSelectChain = createChainMock(['from', 'leftJoin', 'where']);
      volSelectChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(volSelectChain);

      const issueSelectChain = createChainMock(['from', 'leftJoin', 'where']);
      issueSelectChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(issueSelectChain);

      const result = await service.cleanupOrphanedCache();
      expect(result).toEqual({ volumes: 0, issues: 0 });
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
