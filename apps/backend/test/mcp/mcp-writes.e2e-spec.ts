import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, signUp, type TestUser } from '../helpers/auth.helper';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const MCP_URL = `${BASE_URL}/api/mcp`;

interface ChangeItem {
  changeSetId: string;
  tool: string;
  entityType: string;
  id: string;
  field: string;
  before: unknown;
  after: unknown;
  undoneBy?: string;
}

/**
 * The MCP write tools against real Postgres, over HTTP with API keys: each
 * tool changes the library, a dry run changes nothing, every write lands in
 * the change log and undo puts it back, and users without the permission are
 * refused.
 *
 * The tests in "as an editor" run in order on shared series. Every series,
 * collection and user carries a per-run suffix and is removed in afterAll,
 * because the library is shared with the other e2e workers.
 */
describe('MCP write tools (e2e)', () => {
  const run = randomUUID().slice(0, 8);
  let db: Pool;
  let admin: TestUser;
  let reader: TestUser;
  let editor: TestUser;
  const keys: { cookie: string; id: string; key: string }[] = [];
  let adminKey: string;
  let readerKey: string;
  let editorKey: string;
  const clients: Client[] = [];
  const seriesIds: string[] = [];
  const collectionIds: string[] = [];

  // A: two issues. B: one issue, emptied by a move. C: one issue, merged
  // into A. D: no issues, for collections.
  let seriesA: string;
  let seriesB: string;
  let seriesC: string;
  let seriesD: string;
  const issueA1 = randomUUID();
  const issueA2 = randomUUID();
  const issueB1 = randomUUID();
  const issueC1 = randomUUID();

  async function createKey(owner: TestUser): Promise<string> {
    const created = await api.post<{ id: string; key: string }>(
      '/api-keys',
      { name: `MCP writes e2e ${run}` },
      owner.cookie,
    );
    expect(created.status).toBe(201);
    keys.push({ cookie: owner.cookie, ...created.data });
    return created.data.key;
  }

  async function connect(key: string): Promise<Client> {
    const client = new Client({ name: 'bookmark-e2e', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    );
    clients.push(client);
    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    return (await client.callTool({ name, arguments: args })) as CallToolResult;
  }

  function text(result: CallToolResult): string {
    const [first] = result.content;
    return first?.type === 'text' ? first.text : '';
  }

  function json<T>(result: CallToolResult): T {
    if (result.isError) throw new Error(text(result));
    return JSON.parse(text(result)) as T;
  }

  async function createSeries(title: string): Promise<string> {
    const created = await api.post<{ id: string }>(
      '/comics/series',
      { title, startYear: 2010 },
      admin.cookie,
    );
    expect(created.status).toBe(201);
    seriesIds.push(created.data.id);
    return created.data.id;
  }

  async function addIssue(
    id: string,
    seriesId: string,
    number: string,
  ): Promise<void> {
    const file = `MCP writes e2e ${run}/${number}-${id}.cbz`;
    await db.query(
      `INSERT INTO comic_books
         (id, series_id, number, sort_number, format, file_path, file_name, size_bytes, container, page_count)
       VALUES ($1, $2, $3, $4, 'single_issue', $5, $6, 1000, 'cbz', 0)`,
      [id, seriesId, number, Number(number), file, `${number}.cbz`],
    );
  }

  async function seriesRow(id: string) {
    const { rows } = await db.query<{
      title: string;
      description: string | null;
      manual_fields: string[];
    }>(
      'SELECT title, description, manual_fields FROM comic_series WHERE id = $1',
      [id],
    );
    return rows[0];
  }

  async function issueRow(id: string) {
    const { rows } = await db.query<{
      series_id: string;
      number: string;
      cover_date: string | null;
      manual_fields: string[];
    }>(
      `SELECT series_id, number, to_char(cover_date, 'YYYY-MM-DD') AS cover_date, manual_fields
       FROM comic_books WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async function mainCharacters(seriesId: string): Promise<string[]> {
    const { rows } = await db.query<{ name: string }>(
      `SELECT c.name FROM comic_series_main_characters m
       JOIN comic_characters c ON c.id = m.character_id
       WHERE m.series_id = $1 ORDER BY m.position`,
      [seriesId],
    );
    return rows.map((r) => r.name);
  }

  async function members(collectionId: string): Promise<string[]> {
    const { rows } = await db.query<{ series_id: string }>(
      `SELECT series_id FROM comic_collection_series
       WHERE collection_id = $1 ORDER BY position`,
      [collectionId],
    );
    return rows.map((r) => r.series_id);
  }

  async function seriesExists(id: string): Promise<boolean> {
    const { rowCount } = await db.query(
      'SELECT 1 FROM comic_series WHERE id = $1',
      [id],
    );
    return rowCount === 1;
  }

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });

    reader = await signUp(
      `MCP W Reader ${run}`,
      `mcp-w-reader-${run}@test.com`,
      'password123',
    );
    editor = await signUp(
      `MCP W Editor ${run}`,
      `mcp-w-editor-${run}@test.com`,
      'password123',
    );
    for (const [person, permissions] of [
      [reader, { canGenerateApiKeys: true }],
      [editor, { canGenerateApiKeys: true, canEditMetadata: true }],
    ] as const) {
      const updated = await api.patch(
        `/users/${person.id}`,
        permissions,
        admin.cookie,
      );
      expect(updated.status).toBe(200);
    }

    seriesA = await createSeries(`MCP W A ${run}`);
    seriesB = await createSeries(`MCP W B ${run}`);
    seriesC = await createSeries(`MCP W C ${run}`);
    seriesD = await createSeries(`MCP W D ${run}`);
    await addIssue(issueA1, seriesA, '1');
    await addIssue(issueA2, seriesA, '2');
    await addIssue(issueB1, seriesB, '1');
    await addIssue(issueC1, seriesC, '3');

    adminKey = await createKey(admin);
    readerKey = await createKey(reader);
    editorKey = await createKey(editor);
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    for (const { cookie, id } of keys) {
      await api.delete(`/api-keys/${id}`, cookie);
    }
    if (db) {
      const users = [reader?.id, editor?.id].filter(Boolean);
      await db.query('DELETE FROM mcp_change_log WHERE user_id = ANY($1)', [
        users,
      ]);
      await db.query('DELETE FROM comic_collections WHERE id = ANY($1)', [
        collectionIds,
      ]);
      await db.query('DELETE FROM comic_series WHERE id = ANY($1)', [
        seriesIds,
      ]);
    }
    for (const person of [reader, editor]) {
      if (person) await api.delete(`/users/${person.id}`, admin.cookie);
    }
    if (db) await db.end();
  });

  describe('as an editor', () => {
    let client: Client;

    beforeAll(async () => {
      client = await connect(editorKey);
    });

    async function changes(args: Record<string, unknown>) {
      return json<{ items: ChangeItem[] }>(
        await call(client, 'list_changes', args),
      ).items;
    }

    async function undo(changeSetId: string, extra = {}) {
      return call(client, 'undo_change', { changeSetId, ...extra });
    }

    it('update_series: a dry run changes nothing', async () => {
      const preview = json<{ dryRun: boolean; items: object[] }>(
        await call(client, 'update_series', {
          mediaType: 'comic',
          id: seriesA,
          fields: { title: 'Wolverine (2010)' },
          dryRun: true,
        }),
      );

      expect(preview.dryRun).toBe(true);
      expect(preview.items).toEqual([
        {
          id: seriesA,
          fields: {
            title: { from: `MCP W A ${run}`, to: 'Wolverine (2010)' },
          },
        },
      ]);
      expect((await seriesRow(seriesA)).title).toBe(`MCP W A ${run}`);
      expect(await changes({ id: seriesA })).toEqual([]);
    });

    it('update_series: writes, locks, logs, and undo puts it back', async () => {
      const result = json<{ changeSetId: string }>(
        await call(client, 'update_series', {
          mediaType: 'comic',
          id: seriesA,
          fields: { title: 'Wolverine (2010)', publisher: 'Marvel' },
        }),
      );

      let row = await seriesRow(seriesA);
      expect(row.title).toBe('Wolverine (2010)');
      expect(row.manual_fields).toEqual(
        expect.arrayContaining(['title', 'publisher']),
      );

      const logged = await changes({ changeSetId: result.changeSetId });
      expect(logged).toHaveLength(2);
      expect(logged.find((c) => c.field === 'title')).toMatchObject({
        tool: 'update_series',
        entityType: 'comic_series',
        id: seriesA,
        before: { value: `MCP W A ${run}`, locked: false },
        after: { value: 'Wolverine (2010)', locked: true },
      });

      const undone = json<{ undone: number; changeSetId: string }>(
        await undo(result.changeSetId),
      );
      expect(undone.undone).toBe(2);
      row = await seriesRow(seriesA);
      expect(row.title).toBe(`MCP W A ${run}`);
      expect(row.manual_fields).not.toContain('title');
      expect(row.manual_fields).not.toContain('publisher');

      // The undo is logged, and the original rows are marked.
      expect(await changes({ changeSetId: undone.changeSetId })).toHaveLength(
        2,
      );
      const marked = await changes({ changeSetId: result.changeSetId });
      expect(marked.every((c) => c.undoneBy === undone.changeSetId)).toBe(true);
      const again = await undo(result.changeSetId);
      expect(text(again)).toBe('This change set is already undone');
    });

    it('update_item: edits an issue, and undo puts it back', async () => {
      const result = json<{ changeSetId: string }>(
        await call(client, 'update_item', {
          mediaType: 'comic',
          id: issueA1,
          fields: { number: '7', coverDate: '2010-05-01' },
        }),
      );
      let row = await issueRow(issueA1);
      expect(row).toMatchObject({ number: '7', cover_date: '2010-05-01' });
      expect(row.manual_fields).toEqual(
        expect.arrayContaining(['number', 'coverDate']),
      );

      json(await undo(result.changeSetId));
      row = await issueRow(issueA1);
      expect(row).toMatchObject({ number: '1', cover_date: null });
      expect(row.manual_fields).toEqual([]);
    });

    it('update_item: a bulk dry run changes nothing', async () => {
      const preview = json<{ wouldUpdate: number }>(
        await call(client, 'update_item', {
          mediaType: 'comic',
          ids: [issueA1, issueA2],
          fields: { format: 'annual' },
          dryRun: true,
        }),
      );
      expect(preview.wouldUpdate).toBe(2);
      const { rows } = await db.query(
        "SELECT 1 FROM comic_books WHERE id = ANY($1) AND format = 'annual'",
        [[issueA1, issueA2]],
      );
      expect(rows).toHaveLength(0);
    });

    it('unlock_field: removes the lock and keeps the value; undo locks it again', async () => {
      json(
        await call(client, 'update_series', {
          mediaType: 'comic',
          id: seriesA,
          fields: { description: 'Logan in Japan.' },
        }),
      );
      const unlocked = json<{ changeSetId: string; unlocked: string }>(
        // No level: the id is found to be a series.
        await call(client, 'unlock_field', {
          mediaType: 'comic',
          id: seriesA,
          field: 'description',
        }),
      );
      expect(unlocked.unlocked).toBe('description');
      let row = await seriesRow(seriesA);
      expect(row.manual_fields).not.toContain('description');
      expect(row.description).toBe('Logan in Japan.');

      json(await undo(unlocked.changeSetId));
      row = await seriesRow(seriesA);
      expect(row.manual_fields).toContain('description');
      expect(row.description).toBe('Logan in Japan.');
    });

    it('set_main_characters: sets them, and undo clears them', async () => {
      const result = json<{ changeSetId: string; mainCharacters: string[] }>(
        await call(client, 'set_main_characters', {
          seriesId: seriesA,
          names: [`Wolverine ${run}`],
        }),
      );
      expect(result.mainCharacters).toEqual([`Wolverine ${run}`]);
      expect(await mainCharacters(seriesA)).toEqual([`Wolverine ${run}`]);

      json(await undo(result.changeSetId));
      expect(await mainCharacters(seriesA)).toEqual([]);
      expect((await seriesRow(seriesA)).manual_fields).not.toContain(
        'mainCharacters',
      );
    });

    it('create_series and move_items: a dry run changes nothing, undo moves the issue back', async () => {
      const created = json<{ id: string; changeSetId: string }>(
        await call(client, 'create_series', {
          title: `MCP W E ${run}`,
          startYear: 2012,
        }),
      );
      seriesIds.push(created.id);
      expect(await changes({ changeSetId: created.changeSetId })).toEqual([
        expect.objectContaining({ field: 'created', id: created.id }),
      ]);

      const preview = json<{ wouldMove: number; wouldDeleteSeries: object[] }>(
        await call(client, 'move_items', {
          issueIds: [issueA2],
          targetSeriesId: created.id,
          dryRun: true,
        }),
      );
      expect(preview).toMatchObject({ wouldMove: 1, wouldDeleteSeries: [] });
      expect((await issueRow(issueA2)).series_id).toBe(seriesA);

      const moved = json<{ changeSetId: string; moved: number }>(
        await call(client, 'move_items', {
          issueIds: [issueA2],
          targetSeriesId: created.id,
        }),
      );
      expect(moved.moved).toBe(1);
      let row = await issueRow(issueA2);
      expect(row.series_id).toBe(created.id);
      expect(row.manual_fields).toContain('seriesId');

      // Moving it back empties the new series, which is then deleted.
      json(await undo(moved.changeSetId));
      row = await issueRow(issueA2);
      expect(row.series_id).toBe(seriesA);
      expect(row.manual_fields).not.toContain('seriesId');
      expect(await seriesExists(created.id)).toBe(false);
    });

    it('move_items: a series it empties is deleted and kept in the log', async () => {
      const preview = json<{ wouldDeleteSeries: { id: string }[] }>(
        await call(client, 'move_items', {
          issueIds: [issueB1],
          targetSeriesId: seriesA,
          dryRun: true,
        }),
      );
      expect(preview.wouldDeleteSeries.map((s) => s.id)).toEqual([seriesB]);
      expect(await seriesExists(seriesB)).toBe(true);

      const moved = json<{ changeSetId: string; deletedSeries: object[] }>(
        await call(client, 'move_items', {
          issueIds: [issueB1],
          targetSeriesId: seriesA,
        }),
      );
      expect(moved.deletedSeries).toEqual([
        { id: seriesB, title: `MCP W B ${run}` },
      ]);
      expect(await seriesExists(seriesB)).toBe(false);

      const deleted = (
        await changes({ changeSetId: moved.changeSetId, full: true })
      ).find((c) => c.field === 'deleted');
      expect(deleted).toMatchObject({
        entityType: 'comic_series',
        id: seriesB,
        before: { title: `MCP W B ${run}`, issueIds: [issueB1] },
      });

      const result = await undo(moved.changeSetId);
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('old series was deleted');
      expect((await issueRow(issueB1)).series_id).toBe(seriesA);
    });

    it('merge_series: a dry run changes nothing, and a merge is not undone', async () => {
      const preview = json<{
        wouldMove: number;
        wouldDeleteSeries: { id: string }[];
      }>(
        await call(client, 'merge_series', {
          sourceSeriesIds: [seriesC],
          targetSeriesId: seriesA,
          dryRun: true,
        }),
      );
      expect(preview.wouldMove).toBe(1);
      expect(preview.wouldDeleteSeries.map((s) => s.id)).toEqual([seriesC]);
      expect(await seriesExists(seriesC)).toBe(true);

      const merged = json<{ changeSetId: string; moved: number }>(
        await call(client, 'merge_series', {
          sourceSeriesIds: [seriesC],
          targetSeriesId: seriesA,
        }),
      );
      expect(merged.moved).toBe(1);
      expect(await seriesExists(seriesC)).toBe(false);
      expect((await issueRow(issueC1)).series_id).toBe(seriesA);

      const result = await undo(merged.changeSetId);
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('A merge cannot be undone');
    });

    it('collections: create, add, reorder, remove, edit, and undo', async () => {
      const created = json<{ id: string }>(
        await call(client, 'create_collection', {
          name: `MCP W Collection ${run}`,
          seriesIds: [seriesA],
        }),
      );
      collectionIds.push(created.id);
      expect(await members(created.id)).toEqual([seriesA]);

      json(
        await call(client, 'add_to_collection', {
          id: created.id,
          seriesIds: [seriesD],
        }),
      );
      expect(await members(created.id)).toEqual([seriesA, seriesD]);

      const reordered = json<{ changeSetId: string }>(
        await call(client, 'reorder_collection', {
          id: created.id,
          seriesIds: [seriesD, seriesA],
        }),
      );
      expect(await members(created.id)).toEqual([seriesD, seriesA]);
      json(await undo(reordered.changeSetId));
      expect(await members(created.id)).toEqual([seriesA, seriesD]);

      const removed = json<{ changeSetId: string; removed: number }>(
        await call(client, 'remove_from_collection', {
          id: created.id,
          seriesIds: [seriesA],
        }),
      );
      expect(removed.removed).toBe(1);
      expect(await members(created.id)).toEqual([seriesD]);
      json(await undo(removed.changeSetId));
      expect(await members(created.id)).toEqual([seriesA, seriesD]);

      const renamed = json<{ changeSetId: string }>(
        await call(client, 'update_collection', {
          id: created.id,
          fields: { name: `Wolverine solo series ${run}` },
        }),
      );
      const detail = json<{ name: string; series: { id: string }[] }>(
        await call(client, 'get_collection', { id: created.id }),
      );
      expect(detail.name).toBe(`Wolverine solo series ${run}`);
      expect(detail.series.map((s) => s.id)).toEqual([seriesA, seriesD]);

      json(await undo(renamed.changeSetId));
      const listed = json<{ items: { id: string; name: string }[] }>(
        await call(client, 'list_collections', { search: run }),
      );
      expect(listed.items).toEqual([
        { id: created.id, name: `MCP W Collection ${run}`, series: 2 },
      ]);
    });

    it('list_changes filters by record and by user', async () => {
      const mine = await changes({ mine: true, limit: 200 });
      expect(mine.length).toBeGreaterThan(0);
      const forA = await changes({ id: seriesA, entityType: 'comic_series' });
      expect(forA.length).toBeGreaterThan(0);
      expect(forA.every((c) => c.id === seriesA)).toBe(true);
      expect(await changes({ userId: reader.id })).toEqual([]);
    });
  });

  describe('permissions', () => {
    it('refuses every edit tool to a user who cannot edit metadata', async () => {
      const client = await connect(readerKey);
      const before = await seriesRow(seriesA);

      for (const [tool, args] of [
        [
          'update_series',
          { mediaType: 'comic', id: seriesA, fields: { title: 'X' } },
        ],
        [
          'update_item',
          { mediaType: 'comic', id: issueA1, fields: { number: '9' } },
        ],
        [
          'unlock_field',
          {
            mediaType: 'comic',
            level: 'series',
            id: seriesA,
            field: 'description',
          },
        ],
        ['set_main_characters', { seriesId: seriesA, names: ['X'] }],
        ['create_series', { title: `MCP W refused ${run}` }],
        ['move_items', { issueIds: [issueA1], targetSeriesId: seriesD }],
        [
          'merge_series',
          { sourceSeriesIds: [seriesD], targetSeriesId: seriesA },
        ],
        ['create_collection', { name: `MCP W refused ${run}` }],
        ['list_changes', {}],
        ['undo_change', { changeSetId: randomUUID() }],
      ] as const) {
        const result = await call(client, tool, args);
        expect(result.isError).toBe(true);
        expect(text(result)).toBe(
          'You do not have permission to edit metadata',
        );
      }

      expect(await seriesRow(seriesA)).toEqual(before);
      expect((await issueRow(issueA1)).series_id).toBe(seriesA);
      const { rowCount } = await db.query(
        'SELECT 1 FROM mcp_change_log WHERE user_id = $1',
        [reader.id],
      );
      expect(rowCount).toBe(0);
    });

    it('keeps ComicVine links for admins', async () => {
      const editorClient = await connect(editorKey);
      const refused = await call(editorClient, 'link_external', {
        mediaType: 'comic',
        id: seriesA,
        externalId: 42,
      });
      expect(text(refused)).toBe('ComicVine is for admins only');

      // The e2e server has no ComicVine key.
      const adminClient = await connect(adminKey);
      const notSetUp = await call(adminClient, 'link_external', {
        mediaType: 'comic',
        id: seriesA,
        externalId: 42,
      });
      expect(text(notSetUp)).toBe('ComicVine is not set up.');
    });
  });
});
