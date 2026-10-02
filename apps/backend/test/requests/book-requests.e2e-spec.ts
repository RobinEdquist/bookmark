import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { RequestsService } from '../../src/requests/requests.service';
import * as schema from '../../src/requests/schema';
import * as audiobooks from '../../src/audiobooks/schema';
import * as ebooks from '../../src/ebooks/schema';
import * as auth from '../../src/auth/schema';
import type { TrackerService } from '../../src/tracker';
import type { AppSettingsService } from '../../src/app-settings/app-settings.service';
import type { LibraryService } from '../../src/library/library.service';
import type {
  TrackerSearchResult,
  TorrentStatus,
} from '../../src/tracker/types';

/** Real PostgreSQL coverage for intent, leases, and acquisition concurrency. */
describe('Book requests and acquisition (e2e)', () => {
  let pool: Pool;
  let container: StartedPostgreSqlContainer;
  let service: RequestsService;
  const userIds = [randomUUID(), randomUUID()];
  let weeklyLimit = 0;
  let beforeApproval: (() => Promise<void>) | undefined;
  const tracker = {
    getModuleId: jest.fn(() => 'test-module'),
    isConfigured: jest.fn(() => true),
    getLanguages: jest.fn(async () => ({
      languages: [
        { id: 1, name: 'English' },
        { id: 40, name: 'Swedish' },
      ],
    })),
    search: jest.fn(),
    download: jest.fn(),
    getTorrentStatus: jest.fn(),
    getBulkTorrentStatus: jest.fn(),
  };

  beforeAll(async () => {
    // The shared application cron and other E2E workers must not contend for
    // this suite's singleton schedule or add due requests to its batch counts.
    container = await new PostgreSqlContainer('postgres:18').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await migrate(drizzle(pool), {
      migrationsFolder: resolve(__dirname, '../../drizzle/migrations'),
    });
    for (const id of userIds)
      await pool.query(
        'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
        [id, 'Book request regression', `${id}@test.com`],
      );
    const settings = {
      getSettings: async () => ({
        autoApproveRequestsPerWeek: weeklyLimit,
        requestsUseFreeleech: false,
        requestsEnabled: true,
      }),
      getRequestsCategories: async () => {
        await beforeApproval?.();
        return { audiobook: 'audiobooks', ebook: 'books', comics: 'comics' };
      },
    };
    service = new RequestsService(
      drizzle(pool, {
        schema: { ...schema, ...audiobooks, ...ebooks, ...auth },
      }),
      tracker as unknown as TrackerService,
      settings as unknown as AppSettingsService,
      {
        searchLibrary: async () => ({ audiobooks: [], ebooks: [] }),
      } as unknown as LibraryService,
    );
  }, 120_000);
  beforeEach(async () => {
    jest.clearAllMocks();
    weeklyLimit = 0;
    beforeApproval = undefined;
    tracker.getModuleId.mockReturnValue('test-module');
    tracker.getLanguages.mockResolvedValue({
      languages: [
        { id: 1, name: 'English' },
        { id: 40, name: 'Swedish' },
      ],
    });
    tracker.search.mockResolvedValue({ results: [], total: 0 });
    tracker.download.mockImplementation(
      async (_id: string, options: { submissionKey: string }) => ({
        hash: `hash_${options.submissionKey}`,
      }),
    );
    tracker.getTorrentStatus.mockImplementation(async (hash: string) => ({
      hash,
      name: hash,
      state: 'downloading',
      progress: 0,
    }));
    tracker.getBulkTorrentStatus.mockImplementation(
      async (hashes: string[]) => ({
        torrents: hashes.map((hash) => ({
          hash,
          name: hash,
          state: 'downloading',
          progress: 0,
        })),
      }),
    );
  });
  afterEach(async () => {
    await pool.query('DELETE FROM requests WHERE user_id = ANY($1::text[])', [
      userIds,
    ]);
  });
  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
        userIds,
      ]);
      await pool.end();
    }
    await container?.stop();
  });

  function wanted(title: string = randomUUID(), extras = {}) {
    return service.createRequest(
      { title, author: 'An Author', contentType: 'audiobook', ...extras },
      userIds[0],
    );
  }
  async function tick() {
    await pool.query(
      "UPDATE request_search_schedule SET next_run_at = '1970-01-01' WHERE id = 'availability'",
    );
    await service.searchWaitingRequests();
  }
  function release(title: string, id = 10, extras = {}): TrackerSearchResult {
    return {
      id,
      title,
      author: 'An Author',
      contentType: 'audiobook',
      categoryId: 13,
      language: 'English',
      ...extras,
    };
  }

  it('saves an unavailable book and shares compatible support across different releases', async () => {
    const first = await wanted('  Shared Book  ', { languages: [1] });
    const shared = await service.createRequest(
      {
        title: 'shared book',
        author: 'an author',
        contentType: 'audiobook',
        language: 'English',
        torrentId: 20,
        categoryId: 13,
      },
      userIds[1],
    );
    expect(shared.id).toBe(first.id);
    expect(shared.supporterCount).toBe(1);
    expect(shared.torrentId).toBeNull();
    expect(
      (await service.getUserRequests(userIds[1])).map((row) => row.id),
    ).toContain(first.id);
    expect(tracker.download).not.toHaveBeenCalled();
  });

  it('keeps differing medium, language, and author intents distinct', async () => {
    const rows = await Promise.all([
      wanted('Distinct Book'),
      wanted('Distinct Book', { contentType: 'ebook' }),
      wanted('Distinct Book', { languages: [1] }),
      wanted('Distinct Book', { languages: [40] }),
      wanted('Distinct Book', { author: 'Other Author' }),
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(5);
  });

  it('serializes concurrent creation and duplicate support', async () => {
    const title = randomUUID();
    const rows = await Promise.all(
      userIds.map((userId) =>
        service.createRequest(
          { title, author: 'An Author', contentType: 'audiobook' },
          userId,
        ),
      ),
    );
    expect(rows[0].id).toBe(rows[1].id);
    const owner = rows[0].userId;
    const supporter = userIds.find((id) => id !== owner)!;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        service.addSupporter(rows[0].id, supporter),
      ),
    );
    expect(
      (await service.getRequestById(rows[0].id, supporter)).supporterCount,
    ).toBe(1);
  });

  it('attaches discovered releases to pending requests without starting a download', async () => {
    const request = await wanted();
    tracker.search.mockResolvedValue({
      results: [release(request.title)],
      total: 1,
    });
    await tick();
    expect(await service.getRequestById(request.id, userIds[0])).toMatchObject({
      status: 'pending',
      torrentId: '10',
      approvedAt: null,
    });
    expect(tracker.download).not.toHaveBeenCalled();
    await service.approveRequest(request.id);
    expect(tracker.download).toHaveBeenCalledTimes(1);
  });

  it('approves a waiting request once and submits one attempt under concurrent workers', async () => {
    const request = await wanted();
    const approvals = await Promise.allSettled([
      service.approveRequest(request.id),
      service.approveRequest(request.id),
    ]);
    expect(
      approvals.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(tracker.download).not.toHaveBeenCalled();
    tracker.search.mockResolvedValue({
      results: [release(request.title)],
      total: 1,
    });
    await pool.query(
      "UPDATE request_search_schedule SET next_run_at = '1970-01-01' WHERE id = 'availability'",
    );
    await Promise.all([
      service.searchWaitingRequests(),
      service.searchWaitingRequests(),
    ]);
    expect(tracker.download).toHaveBeenCalledTimes(1);
    expect(
      (await service.getAttempts(request.id)).map((attempt) => attempt.status),
    ).toEqual(['tracking']);
  });

  it('uses a release discovered between the initial read and the approval claim', async () => {
    const request = await wanted();
    beforeApproval = async () => {
      await pool.query(
        'UPDATE requests SET torrent_id = $1, category_id = 13, candidate_module = $2 WHERE id = $3',
        ['50', 'test-module', request.id],
      );
    };
    await service.approveRequest(request.id);
    expect(tracker.download).toHaveBeenCalledWith('50', expect.anything());
    expect((await service.getAttempts(request.id))[0].status).toBe('tracking');
  });

  it('never overwrites confirmed library availability from a stale transfer poll', async () => {
    const request = await wanted(undefined, { torrentId: 10, categoryId: 13 });
    await service.approveRequest(request.id);
    tracker.getBulkTorrentStatus.mockImplementationOnce(
      async (hashes: string[]) => {
        expect(
          await service.tryMatchImport(hashes[0], randomUUID(), 'audiobook'),
        ).toBe(true);
        return {
          torrents: hashes.map((hash) => ({
            hash,
            name: hash,
            state: 'failed',
            progress: 0,
            acquisitionFailed: true,
          })),
        };
      },
    );
    await service.updateDownloadingStatuses();
    expect((await service.getRequestById(request.id, userIds[0])).status).toBe(
      'complete',
    );
    expect((await service.getAttempts(request.id))[0].status).toBe('complete');
  });

  it('enforces the weekly allowance across simultaneous requests and spends nothing on discovery', async () => {
    weeklyLimit = 1;
    const rows = await Promise.all(Array.from({ length: 5 }, () => wanted()));
    expect(rows.filter((row) => row.status === 'waiting')).toHaveLength(1);
    expect(await service.getUserAutoApproveUsage(userIds[0])).toEqual({
      used: 1,
      limit: 1,
    });
    await tick();
    expect(await service.getUserAutoApproveUsage(userIds[0])).toEqual({
      used: 1,
      limit: 1,
    });
  });

  it('does not starve later requests beyond the first search batch', async () => {
    await Promise.all(Array.from({ length: 23 }, () => wanted()));
    await tick();
    expect(tracker.search).toHaveBeenCalledTimes(10);
    await tick();
    expect(tracker.search).toHaveBeenCalledTimes(20);
    await tick();
    expect(tracker.search).toHaveBeenCalledTimes(23);
    expect(
      new Set(tracker.search.mock.calls.map(([params]) => params.query)).size,
    ).toBe(23);
  });

  it('recovers expired search leases after restart without stealing a live lease', async () => {
    const live = await wanted();
    const expired = await wanted();
    await pool.query(
      "UPDATE requests SET search_claim = $1, search_lease_until = now() + interval '1 hour' WHERE id = $2",
      [randomUUID(), live.id],
    );
    await pool.query(
      "UPDATE requests SET search_claim = $1, search_lease_until = now() - interval '1 second' WHERE id = $2",
      [randomUUID(), expired.id],
    );
    await tick();
    expect(tracker.search.mock.calls.map(([params]) => params.query)).toEqual([
      expired.title,
    ]);
  });

  it('fences stale workers after their lease is reclaimed', async () => {
    const request = await wanted();
    tracker.search.mockImplementationOnce(async () => {
      await pool.query('UPDATE requests SET search_claim = $1 WHERE id = $2', [
        randomUUID(),
        request.id,
      ]);
      return { results: [release(request.title)], total: 1 };
    });
    await tick();
    expect(
      (await service.getRequestById(request.id, userIds[0])).torrentId,
    ).toBeNull();
    expect(tracker.download).not.toHaveBeenCalled();
  });

  it('defers future publication checks, resumes when due, and clears changed or unknown dates', async () => {
    const request = await wanted();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    tracker.search.mockResolvedValueOnce({
      results: [],
      total: 0,
      releaseDate: future,
    });
    await tick();
    expect(
      (await service.getRequestById(request.id, userIds[0])).nextSearchAt,
    ).toBe(future);
    await tick();
    expect(tracker.search).toHaveBeenCalledTimes(1);
    await expect(service.recheckRequest(request.id)).rejects.toThrow(
      'not eligible',
    );
    await pool.query(
      "UPDATE requests SET next_search_at = now(), release_date = now() - interval '1 second' WHERE id = $1",
      [request.id],
    );
    await tick();
    expect(tracker.search).toHaveBeenCalledTimes(2);
    expect(
      (await service.getRequestById(request.id, userIds[0])).releaseDate,
    ).toBeNull();
  });

  it('keeps checking with backoff after invalid dates or failed searches', async () => {
    const request = await wanted();
    tracker.search.mockResolvedValueOnce({
      results: [],
      total: 0,
      releaseDate: 'invalid',
    });
    await tick();
    expect(await service.getRequestById(request.id, userIds[0])).toMatchObject({
      releaseDate: null,
      searchError: expect.stringContaining('invalid'),
    });
    await service.recheckRequest(request.id);
    tracker.search.mockRejectedValueOnce(
      new Error('credentials must not leak'),
    );
    await tick();
    const retried = await service.getRequestById(request.id, userIds[0]);
    expect(retried.searchError).not.toContain('credentials');
    expect(new Date(retried.nextSearchAt!).getTime()).toBeGreaterThan(
      Date.now() + 86_400_000,
    );
  });

  it('preserves language intent and pauses when the source or taxonomy changes', async () => {
    const request = await wanted(undefined, { languages: [1] });
    tracker.getModuleId.mockReturnValue('other-module');
    await tick();
    expect(tracker.search).not.toHaveBeenCalled();
    tracker.getModuleId.mockReturnValue('test-module');
    await service.recheckRequest(request.id);
    tracker.getLanguages.mockResolvedValueOnce({
      languages: [{ id: 1, name: 'Swedish' }],
    });
    await tick();
    expect(tracker.search).not.toHaveBeenCalled();
    await service.recheckRequest(request.id);
    await tick();
    expect(tracker.search).toHaveBeenCalledWith(
      expect.objectContaining({
        languages: [1],
        book: expect.objectContaining({ languageNames: ['English'] }),
      }),
    );
  });

  it('retains an uncertain submission without automatically downloading again', async () => {
    const request = await wanted(undefined, { torrentId: 10, categoryId: 13 });
    tracker.download.mockRejectedValueOnce(new Error('lost response'));
    await expect(service.approveRequest(request.id)).rejects.toThrow(
      'lost response',
    );
    await tick();
    await service.updateDownloadingStatuses();
    expect(tracker.download).toHaveBeenCalledTimes(1);
    expect((await service.getAttempts(request.id))[0].status).toBe('uncertain');
    await expect(service.recheckRequest(request.id)).rejects.toThrow(
      'not eligible',
    );
  });

  it('preserves approval, supporters, and history across a confirmed failed acquisition and replacement', async () => {
    weeklyLimit = 1;
    const request = await wanted(undefined, { torrentId: 10, categoryId: 13 });
    await service.addSupporter(request.id, userIds[1]);
    tracker.getBulkTorrentStatus.mockImplementationOnce(
      async (hashes: string[]) => ({
        torrents: hashes.map(
          (hash) =>
            ({
              hash,
              name: hash,
              state: 'failed',
              progress: 0,
              acquisitionFailed: true,
            }) satisfies TorrentStatus,
        ),
      }),
    );
    await service.updateDownloadingStatuses();
    tracker.search.mockResolvedValueOnce({
      results: [release(request.title, 20)],
      total: 1,
    });
    await tick();
    const replaced = await service.getRequestById(request.id, userIds[0]);
    expect(replaced).toMatchObject({
      id: request.id,
      torrentId: '20',
      supporterCount: 1,
      approvedAt: request.approvedAt,
    });
    expect(
      (await service.getAttempts(request.id)).map((attempt) => attempt.status),
    ).toEqual(['failed', 'tracking']);
    expect(await service.getUserAutoApproveUsage(userIds[0])).toEqual({
      used: 1,
      limit: 1,
    });
  });

  it('does not replace a transfer after missing status, transient failures, or unknown states', async () => {
    const request = await wanted(undefined, { torrentId: 10, categoryId: 13 });
    await service.approveRequest(request.id);
    tracker.getBulkTorrentStatus.mockRejectedValueOnce(new Error('network'));
    await service.updateDownloadingStatuses();
    tracker.getBulkTorrentStatus.mockResolvedValueOnce({ torrents: [] });
    await service.updateDownloadingStatuses();
    await tick();
    expect(tracker.download).toHaveBeenCalledTimes(1);
    expect((await service.getAttempts(request.id))[0].status).toBe('tracking');
  });

  it('recovers crash-left submissions at startup and after expiry without resubmitting or spending approval again', async () => {
    const stale = await wanted(undefined, { torrentId: 10, categoryId: 13 });
    const recent = await wanted(undefined, { torrentId: 20, categoryId: 13 });
    const tracking = await wanted(undefined, { torrentId: 30, categoryId: 13 });
    await service.addSupporter(stale.id, userIds[1]);
    for (const row of [stale, recent, tracking]) {
      await pool.query(
        "UPDATE requests SET status = 'approved', approved_at = now(), auto_approved_by_user_id = user_id WHERE id = $1",
        [row.id],
      );
      await pool.query(
        "INSERT INTO request_attempts (request_id, module_id, torrent_id, category_id, status, updated_at) VALUES ($1, 'test-module', $2, 13, $3, now() - $4::interval)",
        [
          row.id,
          row.torrentId,
          row.id === tracking.id ? 'tracking' : 'submitting',
          row.id === recent.id ? '0 seconds' : '31 minutes',
        ],
      );
    }
    const original = await service.getRequestById(stale.id, userIds[0]);
    const budget = await service.getUserAutoApproveUsage(userIds[0]);
    await service.onApplicationBootstrap();
    expect((await service.getAttempts(stale.id))[0]).toMatchObject({
      status: 'uncertain',
      reason: expect.stringContaining('interrupted'),
      torrentHash: null,
    });
    expect((await service.getAttempts(recent.id))[0].status).toBe('submitting');
    expect((await service.getAttempts(tracking.id))[0].status).toBe('tracking');
    await pool.query(
      "UPDATE request_attempts SET updated_at = now() - interval '31 minutes' WHERE request_id = $1",
      [recent.id],
    );
    await Promise.all([
      service.recoverStaleSubmissions(),
      service.recoverStaleSubmissions(),
    ]);
    expect((await service.getAttempts(recent.id))[0].status).toBe('uncertain');
    await tick();
    expect(tracker.download).not.toHaveBeenCalled();
    expect(await service.getRequestById(stale.id, userIds[0])).toMatchObject({
      status: 'approved',
      torrentId: '10',
      approvedAt: original.approvedAt,
      autoApprovedByUserId: original.autoApprovedByUserId,
      supporterCount: 1,
    });
    expect(await service.getUserAutoApproveUsage(userIds[0])).toEqual(budget);
    expect(await service.getAttempts(stale.id)).toHaveLength(1);
    await expect(service.recheckRequest(stale.id)).rejects.toThrow(
      'not eligible',
    );
  });

  it.each(['candidate', 'error'])(
    'cancels scheduling and fences a %s search finishing after rejection',
    async (outcome) => {
      const request = await wanted();
      await pool.query(
        "UPDATE requests SET search_error = 'Prior failure' WHERE id = $1",
        [request.id],
      );
      tracker.search.mockImplementationOnce(async () => {
        const rejected = await service.rejectRequest(request.id, {
          reason: 'Declined',
        });
        expect(rejected).toMatchObject({
          status: 'rejected',
          nextSearchAt: null,
          searchError: null,
        });
        if (outcome === 'error')
          throw new Error('Search failed after rejection');
        return { results: [release(request.title)], total: 1 };
      });
      await tick();
      expect(
        await service.getRequestById(request.id, userIds[0]),
      ).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Declined',
        torrentId: null,
        nextSearchAt: null,
        searchError: null,
      });
      expect(
        (
          await pool.query(
            'SELECT search_claim, search_lease_until FROM requests WHERE id = $1',
            [request.id],
          )
        ).rows[0],
      ).toEqual({ search_claim: null, search_lease_until: null });
      await tick();
      expect(tracker.search).toHaveBeenCalledTimes(1);
      expect(tracker.download).not.toHaveBeenCalled();
    },
  );
});
