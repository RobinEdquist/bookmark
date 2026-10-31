import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, signUp, type TestUser } from '../helpers/auth.helper';

interface Entry {
  id: string;
  itemId: string | null;
  missing: boolean;
  position: number;
  note: string | null;
  title: string;
  subtitle: string | null;
  seriesId: string | null;
  readStatus: string;
}
interface Detail {
  id: string;
  mediaType: string;
  name: string;
  entries: Entry[];
  finishedCount: number;
  missingCount: number;
}

/**
 * Reading lists against real Postgres. Every row this suite asserts on is
 * its own (per-run names, generated ids) and is deleted in afterAll, because
 * the library is shared with the other e2e workers.
 */
describe('Reading lists (e2e)', () => {
  const run = randomUUID().slice(0, 8);
  let db: Pool;
  let admin: TestUser;
  let reader: TestUser;
  const seriesIds: string[] = [];
  const listIds: string[] = [];

  const [a1, a2, b1, b2] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  let seriesA: string;
  let seriesB: string;

  async function createSeries(title: string): Promise<string> {
    const created = await api.post<{ id: string }>(
      '/comics/series',
      { title, startYear: 2006 },
      admin.cookie,
    );
    expect(created.status).toBe(201);
    seriesIds.push(created.data.id);
    return created.data.id;
  }

  async function addIssue(id: string, seriesId: string, number: string) {
    await db.query(
      `INSERT INTO comic_books
         (id, series_id, number, sort_number, format, file_path, file_name, size_bytes, container, page_count)
       VALUES ($1, $2, $3, $4, 'single_issue', $5, $6, 1000, 'cbz', 0)`,
      [
        id,
        seriesId,
        number,
        Number(number),
        `Reading lists e2e ${run}/${id}.cbz`,
        `${number}.cbz`,
      ],
    );
  }

  async function createList(name: string): Promise<string> {
    const created = await api.post<{ id: string }>(
      '/reading-lists',
      { mediaType: 'comic', name },
      admin.cookie,
    );
    expect(created.status).toBe(201);
    listIds.push(created.data.id);
    return created.data.id;
  }

  async function detail(id: string, as = admin): Promise<Detail> {
    const response = await api.get<Detail>(`/reading-lists/${id}`, as.cookie);
    expect(response.status).toBe(200);
    return response.data;
  }

  async function storedPositions(id: string): Promise<number[]> {
    const { rows } = await db.query<{ position: number }>(
      'SELECT position FROM reading_list_entries WHERE reading_list_id = $1 ORDER BY position',
      [id],
    );
    return rows.map((r) => r.position);
  }

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    reader = await signUp(
      `Reading lists reader ${run}`,
      `reading-lists-reader-${run}@test.com`,
      'password123',
    );

    seriesA = await createSeries(`Civil War ${run}`);
    seriesB = await createSeries(`Wolverine ${run}`);
    await addIssue(a1, seriesA, '1');
    await addIssue(a2, seriesA, '2');
    await addIssue(b1, seriesB, '42');
    await addIssue(b2, seriesB, '43');
  });

  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM reading_lists WHERE id = ANY($1::uuid[])', [
        listIds,
      ]);
      await db.query('DELETE FROM comic_series WHERE id = ANY($1::uuid[])', [
        seriesIds,
      ]);
    }
    if (reader) await api.delete(`/users/${reader.id}`, admin.cookie);
    if (db) await db.end();
  });

  it('keeps issues from several series in the order given', async () => {
    const id = await createList(`Civil War ${run}`);

    const first = await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, b1], note: 'Core' },
      admin.cookie,
    );
    expect(first.status).toBe(200);
    expect(first.data).toEqual({ added: 2, alreadyIn: 0, entryCount: 2 });

    // Insert between the two, and repeat one that is already in
    const second = await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [b2, a1], position: 1 },
      admin.cookie,
    );
    expect(second.data).toEqual({ added: 1, alreadyIn: 1, entryCount: 3 });

    const list = await detail(id);
    expect(list.mediaType).toBe('comic');
    expect(list.entries.map((e) => e.itemId)).toEqual([a1, b2, b1]);
    expect(list.entries.map((e) => e.title)).toEqual([
      `Civil War ${run} #1`,
      `Wolverine ${run} #43`,
      `Wolverine ${run} #42`,
    ]);
    expect(list.entries.map((e) => e.note)).toEqual(['Core', null, 'Core']);
    expect(list.entries[0]).toMatchObject({
      seriesId: seriesA,
      readStatus: 'unread',
    });
    expect(await storedPositions(id)).toEqual([0, 1, 2]);
  });

  it('refuses series ids for a comic list', async () => {
    const id = await createList(`Series ids ${run}`);
    const response = await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [seriesA] },
      admin.cookie,
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.data)).toContain(
      'Give issue ids, not series ids',
    );
  });

  it('reorders only with every item once', async () => {
    const id = await createList(`Reorder ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, a2, b1] },
      admin.cookie,
    );

    const partial = await api.patch(
      `/reading-lists/${id}/order`,
      { itemIds: [b1, a1] },
      admin.cookie,
    );
    expect(partial.status).toBe(400);

    const full = await api.patch(
      `/reading-lists/${id}/order`,
      { itemIds: [b1, a1, a2] },
      admin.cookie,
    );
    expect(full.status).toBe(200);
    expect((await detail(id)).entries.map((e) => e.itemId)).toEqual([
      b1,
      a1,
      a2,
    ]);
  });

  it('sets notes, removes items and keeps positions in sequence', async () => {
    const id = await createList(`Remove ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, a2, b1, b2] },
      admin.cookie,
    );

    const noted = await api.patch(
      `/reading-lists/${id}/items/${b1}`,
      { note: 'Tie-in' },
      admin.cookie,
    );
    expect(noted.status).toBe(200);

    const removed = await api.delete(
      `/reading-lists/${id}/items/${a2}`,
      admin.cookie,
    );
    expect(removed.status).toBe(200);
    const again = await api.delete(
      `/reading-lists/${id}/items/${a2}`,
      admin.cookie,
    );
    expect(again.status).toBe(404);

    const list = await detail(id);
    expect(list.entries.map((e) => [e.itemId, e.note])).toEqual([
      [a1, null],
      [b1, 'Tie-in'],
      [b2, null],
    ]);
    expect(await storedPositions(id)).toEqual([0, 1, 2]);
  });

  it('moves one item to a place', async () => {
    const id = await createList(`Move ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, a2, b1, b2] },
      admin.cookie,
    );

    const first = await api.patch(
      `/reading-lists/${id}/items/${b2}`,
      { position: 0 },
      admin.cookie,
    );
    expect(first.status).toBe(200);
    expect((await detail(id)).entries.map((e) => e.itemId)).toEqual([
      b2,
      a1,
      a2,
      b1,
    ]);

    // Past the end means last
    await api.patch(
      `/reading-lists/${id}/items/${a1}`,
      { position: 9 },
      admin.cookie,
    );
    expect((await detail(id)).entries.map((e) => e.itemId)).toEqual([
      b2,
      a2,
      b1,
      a1,
    ]);
    expect(await storedPositions(id)).toEqual([0, 1, 2, 3]);
  });

  it('keeps missing issues in place and fills them once the library has them', async () => {
    // ComicVine ids far above real ones, unique per run
    const volumeCvId = 900_000_000 + Math.floor(Math.random() * 90_000_000);
    const issueCvId = volumeCvId + 1;
    const id = await createList(`Missing ${run}`);

    const added = await api.post(
      `/reading-lists/${id}/items`,
      {
        entries: [
          { itemId: a1 },
          {
            missing: {
              title: `Civil War ${run} #2`,
              comicvineVolumeId: volumeCvId,
              number: '2',
            },
          },
          { missing: { title: 'A tie-in', comicvineIssueId: issueCvId } },
          { itemId: b1 },
        ],
      },
      admin.cookie,
    );
    expect(added.status).toBe(200);
    expect(added.data).toEqual({ added: 4, alreadyIn: 0, entryCount: 4 });

    // The same missing issue again is already in the list
    const again = await api.post(
      `/reading-lists/${id}/items`,
      {
        entries: [
          {
            missing: {
              title: 'Civil War #2',
              comicvineVolumeId: volumeCvId,
              number: '02',
            },
          },
        ],
      },
      admin.cookie,
    );
    expect(again.data).toMatchObject({ added: 0, alreadyIn: 1 });

    let list = await detail(id);
    expect(list).toMatchObject({ missingCount: 2 });
    expect(list.entries.map((e) => [e.title, e.missing])).toEqual([
      [`Civil War ${run} #1`, false],
      [`Civil War ${run} #2`, true],
      ['A tie-in', true],
      [`Wolverine ${run} #42`, false],
    ]);
    const missingId = list.entries[1].id;
    expect(list.entries[1].itemId).toBeNull();

    // A missing entry moves by its entry id
    const moved = await api.patch(
      `/reading-lists/${id}/items/${missingId}`,
      { position: 0, note: 'Core' },
      admin.cookie,
    );
    expect(moved.status).toBe(200);
    expect((await detail(id)).entries[0]).toMatchObject({
      id: missingId,
      note: 'Core',
    });

    // The volume arrives: a series linked to it, with issue "02"
    const seriesC = await createSeries(`Civil War linked ${run}`);
    const c2 = randomUUID();
    await addIssue(c2, seriesC, '02');
    const {
      rows: [volume],
    } = await db.query<{ id: string }>(
      `INSERT INTO comicvine_volumes (comicvine_volume_id, name) VALUES ($1, $2) RETURNING id`,
      [volumeCvId, `Civil War ${run}`],
    );
    await db.query(
      'INSERT INTO comicvine_volume_links (series_id, comicvine_volume_row_id) VALUES ($1, $2)',
      [seriesC, volume.id],
    );
    // And the tie-in: an issue linked to its ComicVine issue
    const {
      rows: [issue],
    } = await db.query<{ id: string }>(
      'INSERT INTO comicvine_issues (comicvine_issue_id) VALUES ($1) RETURNING id',
      [issueCvId],
    );
    await db.query(
      'INSERT INTO comicvine_issue_links (book_id, comicvine_issue_row_id) VALUES ($1, $2)',
      [b2, issue.id],
    );

    list = await detail(id);
    expect(list).toMatchObject({ missingCount: 0 });
    expect(list.entries.map((e) => [e.itemId, e.note])).toEqual([
      [c2, 'Core'],
      [a1, null],
      [b2, null],
      [b1, null],
    ]);
    expect(await storedPositions(id)).toEqual([0, 1, 2, 3]);

    await db.query('DELETE FROM comicvine_issues WHERE id = $1', [issue.id]);
    await db.query('DELETE FROM comicvine_volumes WHERE id = $1', [volume.id]);
  });

  it('finds the lists that hold an item', async () => {
    const id = await createList(`Holds ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [b2] },
      admin.cookie,
    );

    const response = await api.get<{
      readingLists: { id: string; entryCount: number }[];
    }>(`/reading-lists?mediaType=comic&itemId=${b2}&limit=100`, admin.cookie);
    expect(response.status).toBe(200);
    expect(response.data.readingLists).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, entryCount: 1 })]),
    );

    const ebooks = await api.get<{ readingLists: { id: string }[] }>(
      `/reading-lists?mediaType=ebook&itemId=${b2}`,
      admin.cookie,
    );
    expect(ebooks.data.readingLists.map((l) => l.id)).not.toContain(id);
  });

  it('shows the read status of each issue to its reader', async () => {
    const id = await createList(`Progress ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, a2] },
      admin.cookie,
    );
    await db.query(
      `INSERT INTO comic_book_progress (user_id, comic_book_id, current_page, page_count, status)
       VALUES ($1, $2, 21, 22, 'finished')`,
      [reader.id, a1],
    );

    const asReader = await detail(id, reader);
    expect(asReader.entries.map((e) => e.readStatus)).toEqual([
      'finished',
      'unread',
    ]);
    expect(asReader.finishedCount).toBe(1);
    expect((await detail(id)).finishedCount).toBe(0);
  });

  it('lets anyone read but only editors change a list', async () => {
    const id = await createList(`Permissions ${run}`);

    expect((await api.get(`/reading-lists/${id}`, reader.cookie)).status).toBe(
      200,
    );
    expect(
      (
        await api.post(
          '/reading-lists',
          { mediaType: 'comic', name: `Nope ${run}` },
          reader.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api.post(
          `/reading-lists/${id}/items`,
          { itemIds: [a1] },
          reader.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (await api.delete(`/reading-lists/${id}`, reader.cookie)).status,
    ).toBe(403);

    expect(
      (await api.delete(`/reading-lists/${id}`, admin.cookie)).status,
    ).toBe(204);
    expect((await api.get(`/reading-lists/${id}`, admin.cookie)).status).toBe(
      404,
    );
  });

  it('drops an issue deleted from the library and keeps the order after it', async () => {
    const gone = randomUUID();
    await addIssue(gone, seriesA, '99');
    const id = await createList(`Deleted issue ${run}`);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [a1, gone, b1] },
      admin.cookie,
    );

    await db.query('DELETE FROM comic_books WHERE id = $1', [gone]);
    await api.post(
      `/reading-lists/${id}/items`,
      { itemIds: [b2] },
      admin.cookie,
    );

    const list = await detail(id);
    expect(list.entries.map((e) => e.itemId)).toEqual([a1, b1, b2]);
    const positions = await storedPositions(id);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
