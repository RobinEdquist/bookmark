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
  };
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
    it('updates an existing volume and returns it', async () => {
      const existingRow = { id: 'uuid-vol-1' };
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValueOnce([existingRow]);
      db.select.mockReturnValueOnce(selectChain);

      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      const selectChain2 = createChainMock(['from', 'where', 'limit']);
      const updatedRow = {
        id: 'uuid-vol-1',
        comicvineVolumeId: 12345,
        name: 'X-Men',
      };
      selectChain2.limit.mockResolvedValueOnce([updatedRow]);
      db.select.mockReturnValueOnce(selectChain2);

      const result = await service.upsertVolume(buildCvVolume());
      expect(result).toEqual(updatedRow);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts a new volume when not found', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(selectChain);

      const insertChain = createChainMock(['values', 'returning']);
      const newRow = {
        id: 'uuid-vol-new',
        comicvineVolumeId: 12345,
        name: 'X-Men',
      };
      insertChain.returning.mockResolvedValueOnce([newRow]);
      db.insert.mockReturnValueOnce(insertChain);

      const result = await service.upsertVolume(buildCvVolume());
      expect(result).toEqual(newRow);
      expect(db.insert).toHaveBeenCalledTimes(1);
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
      // upsertVolume: select (existing check)
      const upsertSelect = createChainMock(['from', 'where', 'limit']);
      upsertSelect.limit.mockResolvedValueOnce([]); // not found → insert
      db.select.mockReturnValueOnce(upsertSelect);

      // upsertVolume: insert
      const upsertInsert = createChainMock(['values', 'returning']);
      const cachedVol = { id: 'cached-vol-uuid', comicvineVolumeId: 12345 };
      upsertInsert.returning.mockResolvedValueOnce([cachedVol]);
      db.insert.mockReturnValueOnce(upsertInsert);

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

      // linkSeriesToVolume: upsertVolume select (not found)
      const upsertSelect = createChainMock(['from', 'where', 'limit']);
      upsertSelect.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(upsertSelect);

      // upsertVolume: insert
      const upsertInsert = createChainMock(['values', 'returning']);
      const cachedVol = { id: 'cached-asm-uuid', comicvineVolumeId: 99 };
      upsertInsert.returning.mockResolvedValueOnce([cachedVol]);
      db.insert.mockReturnValueOnce(upsertInsert);

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

      // upsertIssue: select existing (not found)
      const issueSelectChain = createChainMock(['from', 'where', 'limit']);
      issueSelectChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(issueSelectChain);

      // upsertIssue is called TWICE:
      //   1. From getVolumeIssuesPaged (caches the issue into DB)
      //   2. From linkBookToIssue (re-upserts the raw shape built from bestMatch)
      //
      // For call 1: select finds nothing → insert → returns cachedIssue row
      // For call 2: select finds the existing row → update → re-select → return

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

      // --- upsertIssue call 1 (from getVolumeIssuesPaged): not found → insert ---
      const insert1Returning = jest.fn().mockResolvedValueOnce([cachedIssue]);
      const insert1Chain = {
        values: jest.fn().mockImplementation(function (this: unknown) {
          return insert1Chain;
        }),
        returning: insert1Returning,
        onConflictDoUpdate: jest.fn().mockReturnThis(),
        onConflictDoNothing: jest.fn().mockReturnThis(),
      };
      db.insert.mockReturnValueOnce(insert1Chain);

      // --- upsertIssue call 2 (from linkBookToIssue): found → update + re-select ---
      // select existing (FOUND this time)
      const issueSelectChain2 = createChainMock(['from', 'where', 'limit']);
      issueSelectChain2.limit.mockResolvedValueOnce([
        { id: 'cached-issue-uuid' },
      ]);
      db.select.mockReturnValueOnce(issueSelectChain2);

      // update
      const issueUpdateChain = createChainMock(['set', 'where']);
      issueUpdateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(issueUpdateChain);

      // re-select after update
      const issueReSelectChain = createChainMock(['from', 'where', 'limit']);
      issueReSelectChain.limit.mockResolvedValueOnce([cachedIssue]);
      db.select.mockReturnValueOnce(issueReSelectChain);

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
      // upsertVolume: select not found
      const upsertSelect = createChainMock(['from', 'where', 'limit']);
      upsertSelect.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(upsertSelect);

      // upsertVolume: insert
      const upsertInsert = createChainMock(['values', 'returning']);
      const cachedVol = { id: 'vol-uuid', comicvineVolumeId: 12345 };
      upsertInsert.returning.mockResolvedValueOnce([cachedVol]);
      db.insert.mockReturnValueOnce(upsertInsert);

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

      await service.addToSyncQueue('series', 'series-1');
      await new Promise(process.nextTick); // flush async emit

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockWsEvents.comicvineSyncStatusUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ pendingCount: 1 }),
      );
    });

    it('skips when series is already in queue', async () => {
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([{ id: 'existing' }]);
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(linkCheck);

      await service.addToSyncQueue('series', 'series-1');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('skips when series is already linked', async () => {
      const queueCheck = createChainMock(['from', 'where', 'limit']);
      queueCheck.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(queueCheck);

      const linkCheck = createChainMock(['from', 'where', 'limit']);
      linkCheck.limit.mockResolvedValueOnce([{ seriesId: 'series-1' }]);
      db.select.mockReturnValueOnce(linkCheck);

      await service.addToSyncQueue('series', 'series-1');
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
    it('returns the count of pending queue items', async () => {
      const chain = createChainMock(['from', 'where']);
      chain.where.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getPendingCount();
      expect(result).toBe(2);
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
