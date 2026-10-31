import { ForbiddenException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthenticatedUser } from '../../common/guards/auth.guard';
import { McpAccessService } from '../mcp-access.service';
import { McpExternalService } from '../mcp-external.service';
import { McpInspectService } from '../mcp-inspect.service';
import { McpLibraryService } from '../mcp-library.service';
import { McpServerFactory } from '../mcp-server.factory';
import { McpViewService } from '../mcp-view.service';

const ID = '00000000-0000-4000-8000-000000000001';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    name: 'Reader',
    email: 'reader@example.com',
    emailVerified: true,
    image: null,
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const admin = user({ id: 'admin-1', role: 'admin' });
const reader = user();
const editor = user({ id: 'editor-1' });

/**
 * A drizzle query builder stand-in: every method returns the builder, and
 * awaiting it yields `rows(callIndex)`. Enough for the permission lookup and
 * the "is this id an issue?" lookup the tools make before calling services.
 */
function fakeDb(rows: () => unknown[]) {
  const builder: object = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'then'
          ? (resolve: (value: unknown) => void) => resolve(rows())
          : () => builder,
    },
  );
  return { select: jest.fn(() => builder) };
}

/** Rejects for the blacklisted reader, the way the comics service does. */
const blacklistCheck = jest.fn(async (_id: string, userId: string) => {
  if (userId === reader.id) throw new ForbiddenException('Access denied');
});

function buildFactory() {
  // Only the editor has the edit-metadata permission row.
  const access = new McpAccessService(
    fakeDb(() =>
      currentUser.id === editor.id ? [{ canEditMetadata: true }] : [],
    ) as never,
  );

  const gaps = {
    getSummary: jest.fn(async (type: string) => ({
      type,
      totalItems: 1,
      itemsWithGaps: 1,
      gaps: [{ key: 'description', count: 1, category: 'essentials' }],
    })),
    list: jest.fn(async () => ({ items: [], total: 0 })),
  };
  const comicsService = {
    visibleSeriesConditions: jest.fn(() => []),
    getSeriesById: jest.fn(async (id: string, userId: string) => {
      await blacklistCheck(id, userId);
      throw new Error('not reached in these tests');
    }),
    getBookById: jest.fn(async (id: string, userId: string) => {
      await blacklistCheck(id, userId);
      throw new Error('not reached in these tests');
    }),
    verifyBookNotBlacklisted: blacklistCheck,
    verifySeriesNotBlacklisted: blacklistCheck,
  };
  const comicvineService = {
    getApiKey: jest.fn(async () => 'key'),
    searchVolumes: jest.fn(async () => ({ totalResults: 0, results: [] })),
  };
  const audnexusService = { searchAudible: jest.fn(async () => []) };

  const library = new McpLibraryService(
    fakeDb(() => [{ value: 3 }]) as never,
    access,
    gaps as never,
    comicsService as never,
  );
  const inspect = new McpInspectService(
    fakeDb(() => []) as never,
    {} as never,
    {} as never,
    {} as never,
    comicsService as never,
    {} as never,
    {} as never,
  );
  const view = new McpViewService(
    // The id is an issue.
    fakeDb(() => [{ id: ID, pageCount: 10 }]) as never,
    {} as never,
    {} as never,
    comicsService as never,
    {} as never,
    {} as never,
  );
  const external = new McpExternalService(
    fakeDb(() => []) as never,
    access,
    {} as never,
    {} as never,
    comicsService as never,
    comicvineService as never,
    {} as never,
    {} as never,
    audnexusService as never,
    {} as never,
    {} as never,
  );
  // The write tools have their own spec (mcp-write-tools.spec.ts).
  const writeTools = { register: jest.fn() };
  const factory = new McpServerFactory(
    library,
    inspect,
    view,
    external,
    { getVersion: () => ({ version: 'test' }) } as never,
    writeTools as never,
  );

  return { factory, gaps, comicvineService, audnexusService };
}

let currentUser = reader;

async function connect(as: AuthenticatedUser) {
  currentUser = as;
  const built = buildFactory();
  const server = built.factory.create(as);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { ...built, client, call };
}

function textOf(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === 'text' ? first.text : '';
}

describe('MCP tools', () => {
  beforeEach(() => blacklistCheck.mockClear());

  it('offers the read-only tools, each marked read-only', async () => {
    const { client } = await connect(admin);
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'find_items',
      'get_item',
      'get_match_candidates',
      'get_series',
      'library_overview',
      'search_external',
      'view_item',
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });

  it('offers the tidy_comics prompt with the preferences given', async () => {
    const { client } = await connect(editor);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['tidy_comics']);

    const prompt = await client.getPrompt({
      name: 'tidy_comics',
      arguments: { descriptions: 'replace', fileData: 'keep' },
    });
    const [message] = prompt.messages;
    const text = message.content.type === 'text' ? message.content.text : '';
    expect(text).toContain('Replace descriptions with your own');
    expect(text).toContain('Only fill fields that are empty');
  });

  describe('library_overview', () => {
    it('refuses a user who cannot edit metadata', async () => {
      const { call, gaps } = await connect(reader);
      const result = await call('library_overview');

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'You do not have permission to edit metadata',
      );
      expect(gaps.getSummary).not.toHaveBeenCalled();
    });

    it('counts what the caller can see', async () => {
      const { call, gaps } = await connect(editor);
      const result = await call('library_overview');

      expect(result.isError).toBeFalsy();
      expect(gaps.getSummary).toHaveBeenCalledWith('comic', {
        viewerId: editor.id,
      });
      expect(JSON.parse(textOf(result)).comics).toEqual({
        series: 1,
        issues: 3,
        seriesNeedAttention: 1,
        missing: { description: 1 },
      });
    });
  });

  describe('find_items', () => {
    it('refuses a user who cannot edit metadata', async () => {
      const { call, gaps } = await connect(reader);
      const result = await call('find_items', { mediaType: 'comic' });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('permission to edit metadata');
      expect(gaps.list).not.toHaveBeenCalled();
    });

    it('names the valid gaps when given one the media type lacks', async () => {
      const { call } = await connect(editor);
      const result = await call('find_items', {
        mediaType: 'comic',
        missing: ['narrator'],
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Unknown gap for comic: narrator');
      expect(textOf(result)).toContain('comicvineLink');
    });

    it('passes the filters and hides blacklisted items', async () => {
      const { call, gaps } = await connect(editor);
      await call('find_items', {
        mediaType: 'audiobook',
        unlinked: true,
        noSeries: true,
        withGaps: false,
        search: 'dune',
      });

      expect(gaps.list).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'audiobook', search: 'dune' }),
        {
          viewerId: editor.id,
          unlinked: true,
          withoutSeries: true,
          includeComplete: true,
        },
      );
    });
  });

  describe.each([
    ['get_item', { mediaType: 'comic', id: ID }],
    ['get_series', { mediaType: 'comic', id: ID }],
    ['view_item', { mediaType: 'comic', id: ID }],
  ])('%s', (tool, args) => {
    it('refuses an item the caller has blacklisted', async () => {
      const { call } = await connect(reader);
      const result = await call(tool, args);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Access denied');
      expect(blacklistCheck).toHaveBeenCalledWith(ID, reader.id);
    });
  });

  describe.each([
    ['search_external', { mediaType: 'comic', query: 'Wolverine' }],
    ['get_match_candidates', { mediaType: 'comic', id: ID }],
  ])('%s', (tool, args) => {
    it('refuses ComicVine to a user who is not an admin', async () => {
      const { call, comicvineService } = await connect(editor);
      const result = await call(tool, args);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('ComicVine is for admins only');
      expect(comicvineService.searchVolumes).not.toHaveBeenCalled();
    });
  });

  it('lets any user search Audible, as GET /audnexus/search does', async () => {
    const { call, audnexusService } = await connect(reader);
    const result = await call('search_external', {
      mediaType: 'audiobook',
      source: 'audible',
      query: 'Dune',
    });

    expect(result.isError).toBeFalsy();
    expect(audnexusService.searchAudible).toHaveBeenCalledWith(
      'Dune',
      undefined,
    );
  });

  it('refuses a source that has nothing for the media type', async () => {
    const { call } = await connect(admin);
    const result = await call('search_external', {
      mediaType: 'comic',
      source: 'audible',
      query: 'Dune',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Use one of: comicvine');
  });

  it('does not pass server internals to the agent', async () => {
    const { call, gaps } = await connect(editor);
    gaps.getSummary.mockRejectedValueOnce(
      new Error('relation "comic_series" does not exist'),
    );
    const result = await call('library_overview');

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('The tool failed on the server.');
  });
});
