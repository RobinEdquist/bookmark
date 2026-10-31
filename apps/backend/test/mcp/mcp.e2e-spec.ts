import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, signUp, type TestUser } from '../helpers/auth.helper';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const MCP_URL = `${BASE_URL}/api/mcp`;

interface FieldReport {
  value: unknown;
  source: string | null;
  locked?: true;
  other?: Record<string, unknown>;
}

/**
 * The MCP endpoint against real Postgres: an MCP client connects over
 * Streamable HTTP with an API key, lists the tools and calls each one, and
 * the per-tool guards refuse users without the permission.
 *
 * Every series, tag and user here carries a per-run suffix and is removed in
 * afterAll, because the library is shared with the other e2e workers.
 */
describe('MCP endpoint (e2e)', () => {
  const run = randomUUID().slice(0, 8);
  const folder = `MCP e2e ${run}/Wolverine (2010)`;
  let db: Pool;
  let admin: TestUser;
  let reader: TestUser;
  let editor: TestUser;
  const keys: { cookie: string; id: string; key: string }[] = [];
  let adminKey: string;
  let readerKey: string;
  let editorKey: string;
  let seriesId: string;
  let blockedSeriesId: string;
  let tagId: string;
  const bookId = randomUUID();
  const clients: Client[] = [];

  async function createKey(owner: TestUser): Promise<string> {
    const created = await api.post<{ id: string; key: string }>(
      '/api-keys',
      { name: `MCP e2e ${run}` },
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
    expect(result.isError).toBeFalsy();
    return JSON.parse(text(result)) as T;
  }

  async function createSeries(title: string): Promise<string> {
    const created = await api.post<{ id: string }>(
      '/comics/series',
      { title, startYear: 2010 },
      admin.cookie,
    );
    expect(created.status).toBe(201);
    return created.data.id;
  }

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });

    reader = await signUp(
      `MCP Reader ${run}`,
      `mcp-reader-${run}@test.com`,
      'password123',
    );
    editor = await signUp(
      `MCP Editor ${run}`,
      `mcp-editor-${run}@test.com`,
      'password123',
    );

    seriesId = await createSeries(`MCP Wolverine ${run}`);
    blockedSeriesId = await createSeries(`MCP Blocked ${run}`);

    // A folder and one issue file, as a library scan would record them.
    await db.query('UPDATE comic_series SET folder_path = $1 WHERE id = $2', [
      folder,
      seriesId,
    ]);
    await db.query(
      `INSERT INTO comic_books
         (id, series_id, number, format, file_path, file_name, size_bytes, container, page_count)
       VALUES ($1, $2, '1', 'single_issue', $3, $4, 1000, 'cbz', 0)`,
      [
        bookId,
        seriesId,
        `${folder}/Wolverine 001 (2010).cbz`,
        'Wolverine 001 (2010).cbz',
      ],
    );

    const cover = await sharp({
      create: { width: 300, height: 450, channels: 3, background: '#a33' },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(cover)], { type: 'image/jpeg' }),
      'cover.jpg',
    );
    const uploaded = await fetch(
      `${BASE_URL}/api/comics/series/${seriesId}/cover`,
      { method: 'POST', headers: { Cookie: admin.cookie }, body: form },
    );
    expect(uploaded.status).toBe(201);

    // The editor has blacklisted a tag on the second series.
    const tag = await db.query<{ id: string }>(
      'INSERT INTO tags (name) VALUES ($1) RETURNING id',
      [`mcp-e2e-${run}`],
    );
    tagId = tag.rows[0].id;
    await db.query(
      'INSERT INTO comic_series_tags (series_id, tag_id) VALUES ($1, $2)',
      [blockedSeriesId, tagId],
    );

    for (const [person, permissions] of [
      [reader, { canGenerateApiKeys: true }],
      [
        editor,
        {
          canGenerateApiKeys: true,
          canEditMetadata: true,
          blacklistedTags: [tagId],
        },
      ],
    ] as const) {
      const updated = await api.patch(
        `/users/${person.id}`,
        permissions,
        admin.cookie,
      );
      expect(updated.status).toBe(200);
    }

    adminKey = await createKey(admin);
    readerKey = await createKey(reader);
    editorKey = await createKey(editor);
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    for (const { cookie, id } of keys) {
      await api.delete(`/api-keys/${id}`, cookie);
    }
    for (const id of [seriesId, blockedSeriesId]) {
      if (id) await api.delete(`/comics/series/${id}`, admin.cookie);
    }
    for (const person of [reader, editor]) {
      if (person) await api.delete(`/users/${person.id}`, admin.cookie);
    }
    if (db) {
      if (tagId) await db.query('DELETE FROM tags WHERE id = $1', [tagId]);
      await db.end();
    }
  });

  describe('transport and auth', () => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'curl', version: '1' },
      },
    };
    const post = (headers: Record<string, string>) =>
      fetch(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify(initialize),
      });

    it('refuses a request without an API key', async () => {
      expect((await post({})).status).toBe(401);
    });

    it('refuses a key that is not valid', async () => {
      expect(
        (await post({ Authorization: 'Bearer bkmrk_not_a_real_key' })).status,
      ).toBe(401);
    });

    it('refuses a browser session without a key', async () => {
      expect((await post({ Cookie: admin.cookie })).status).toBe(401);
    });

    it('answers initialize as JSON with a key', async () => {
      const response = await post({ Authorization: `Bearer ${adminKey}` });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'application/json',
      );
      const body = (await response.json()) as {
        result: { serverInfo: { name: string } };
      };
      expect(body.result.serverInfo.name).toBe('bookmark');
    });

    it('has no sessions to stream or end', async () => {
      for (const method of ['GET', 'DELETE']) {
        const response = await fetch(MCP_URL, {
          method,
          headers: { Authorization: `Bearer ${adminKey}` },
        });
        expect(response.status).toBe(405);
      }
    });
  });

  describe('as an admin', () => {
    let client: Client;

    beforeAll(async () => {
      client = await connect(adminKey);
    });

    it('marks the read tools read-only', async () => {
      const { tools } = await client.listTools();
      const readTools = [
        'find_items',
        'get_item',
        'get_match_candidates',
        'get_series',
        'library_overview',
        'search_external',
        'view_item',
      ];
      for (const name of readTools) {
        const tool = tools.find((t) => t.name === name);
        expect(tool?.annotations?.readOnlyHint).toBe(true);
      }
    });

    it('library_overview counts comic series and issues', async () => {
      const overview = json<{
        comics: { series: number; issues: number; missing: object };
      }>(await call(client, 'library_overview'));
      expect(overview.comics.series).toBeGreaterThanOrEqual(2);
      expect(overview.comics.issues).toBeGreaterThanOrEqual(1);
    });

    it('find_items resolves comic gaps against the database', async () => {
      const find = async (args: Record<string, unknown>) =>
        json<{ items: { id: string; gaps: string[] }[] }>(
          await call(client, 'find_items', {
            mediaType: 'comic',
            search: run,
            ...args,
          }),
        ).items;

      const all = await find({ withGaps: false });
      expect(all.map((item) => item.id).sort()).toEqual(
        [seriesId, blockedSeriesId].sort(),
      );
      const wolverine = all.find((item) => item.id === seriesId)!;
      // Cover uploaded, issue numbered; no ComicVine, characters or dates.
      expect(wolverine.gaps).toEqual(
        expect.arrayContaining([
          'comicvineLink',
          'mainCharacters',
          'issueCoverDates',
        ]),
      );
      expect(wolverine.gaps).not.toContain('cover');
      expect(wolverine.gaps).not.toContain('issueNumbers');
      expect(wolverine.gaps).not.toContain('startYear');

      expect((await find({ missing: ['cover'] })).map((i) => i.id)).toEqual([
        blockedSeriesId,
      ]);
      expect(
        (await find({ missing: ['issueCoverDates'] })).map((i) => i.id),
      ).toEqual([seriesId]);
    });

    it('get_series shows the folder, field sources and issue paths', async () => {
      const series = json<{
        path: string;
        fields: Record<string, FieldReport>;
        comicvine: unknown;
        issues: { total: number; items: { id: string; path: string }[] };
      }>(
        await call(client, 'get_series', {
          mediaType: 'comic',
          id: seriesId,
        }),
      );

      expect(series.path).toBe(folder);
      expect(series.fields.title).toEqual({
        value: `MCP Wolverine ${run}`,
        source: 'file',
      });
      expect(series.fields.description).toEqual({
        value: null,
        source: null,
        other: { file: null },
      });
      expect(series.comicvine).toBeNull();
      expect(series.issues.total).toBe(1);
      expect(series.issues.items[0]).toMatchObject({
        id: bookId,
        path: `${folder}/Wolverine 001 (2010).cbz`,
      });
    });

    it('get_item shows the issue with its file path', async () => {
      const issue = json<{
        path: string;
        series: { id: string };
        fields: Record<string, FieldReport>;
      }>(await call(client, 'get_item', { mediaType: 'comic', id: bookId }));

      expect(issue.path).toBe(`${folder}/Wolverine 001 (2010).cbz`);
      expect(issue.series.id).toBe(seriesId);
      expect(issue.fields.number).toEqual({ value: '1', source: 'file' });
    });

    it('view_item returns the cover as a downscaled image', async () => {
      const result = await call(client, 'view_item', {
        mediaType: 'comic',
        id: seriesId,
      });
      expect(result.isError).toBeFalsy();

      const summary = JSON.parse(text(result)) as {
        images: string[];
        issueId: string;
      };
      expect(summary.images).toEqual(['cover']);
      expect(summary.issueId).toBe(bookId);

      const image = result.content.find((part) => part.type === 'image');
      expect(image).toMatchObject({ mimeType: 'image/jpeg' });
      const data = Buffer.from((image as { data: string }).data, 'base64');
      const { height } = await sharp(data).metadata();
      expect(height).toBeLessThanOrEqual(1024);
    });

    it('search_external and get_match_candidates say ComicVine is not set up', async () => {
      for (const [tool, args] of [
        ['search_external', { mediaType: 'comic', query: 'Wolverine' }],
        ['get_match_candidates', { mediaType: 'comic', id: seriesId }],
      ] as const) {
        const result = await call(client, tool, args);
        expect(result.isError).toBe(true);
        expect(text(result)).toBe('ComicVine is not set up.');
      }
    });
  });

  describe('permissions', () => {
    it('refuses the worklist tools to a user who cannot edit metadata', async () => {
      const client = await connect(readerKey);
      for (const [tool, args] of [
        ['library_overview', {}],
        ['find_items', { mediaType: 'comic' }],
      ] as const) {
        const result = await call(client, tool, args);
        expect(result.isError).toBe(true);
        expect(text(result)).toBe(
          'You do not have permission to edit metadata',
        );
      }
    });

    it('lets that user read a series it can see', async () => {
      const client = await connect(readerKey);
      const series = json<{ id: string }>(
        await call(client, 'get_series', { mediaType: 'comic', id: seriesId }),
      );
      expect(series.id).toBe(seriesId);
    });

    it('hides and refuses blacklisted series', async () => {
      const client = await connect(editorKey);

      const found = json<{ items: { id: string }[] }>(
        await call(client, 'find_items', {
          mediaType: 'comic',
          search: run,
          withGaps: false,
        }),
      );
      expect(found.items.map((item) => item.id)).toEqual([seriesId]);

      for (const tool of ['get_series', 'view_item']) {
        const result = await call(client, tool, {
          mediaType: 'comic',
          id: blockedSeriesId,
        });
        expect(result.isError).toBe(true);
        expect(text(result)).toBe('Access denied');
      }
    });

    it('keeps ComicVine for admins', async () => {
      const client = await connect(editorKey);
      for (const [tool, args] of [
        ['search_external', { mediaType: 'comic', query: 'Wolverine' }],
        ['get_match_candidates', { mediaType: 'comic', id: seriesId }],
      ] as const) {
        const result = await call(client, tool, args);
        expect(result.isError).toBe(true);
        expect(text(result)).toBe('ComicVine is for admins only');
      }
    });
  });
});
