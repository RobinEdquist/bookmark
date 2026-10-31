import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthenticatedUser } from '../../common/guards/auth.guard';
import { McpAccessService } from '../mcp-access.service';
import { McpEditService, checkFields } from '../mcp-edit.service';
import { McpStructureService } from '../mcp-structure.service';
import { McpCollectionsService } from '../mcp-collections.service';
import { MERGE_NOT_UNDONE, McpUndoService } from '../mcp-undo.service';
import { McpLinkService } from '../mcp-link.service';
import { McpWriteTools } from '../mcp-write-tools';
import { tidyComicsText } from '../mcp-prompts';
import type { ChangeRow } from '../mcp-change-log.service';
import type { FieldState } from '../mcp-fields';

const ID = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const SET = '00000000-0000-4000-8000-0000000000aa';

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

/** A drizzle query builder stand-in that resolves to `rows()`. */
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

let currentUser = reader;
/** What the store reads for every field, unless a test overrides it. */
let stored: FieldState = { value: 'Old', locked: false };
let changeRows: Partial<ChangeRow>[] = [];
/** Series titles as the app shows them, which may differ from the stored ones. */
const SHOWN_TITLES: Record<string, string> = {
  [ID]: 'Wolverine (2010)',
  [OTHER]: 'X-Men (1991)',
};

function build() {
  // Only the editor has the edit-metadata permission row; admins always pass.
  const access = new McpAccessService(
    fakeDb(() =>
      currentUser.id === editor.id ? [{ canEditMetadata: true }] : [],
    ) as never,
  );

  const store = {
    verifyAccess: jest.fn(async () => undefined),
    comicEntity: jest.fn(async () => 'comic_series'),
    read: jest.fn(async (_type: string, _id: string, fields: string[]) =>
      Object.fromEntries(fields.map((f) => [f, stored])),
    ),
    write: jest.fn(async () => undefined),
    unlock: jest.fn(async () => true),
    lockedFields: jest.fn(async () => ['title']),
    collectionMembers: jest.fn(async () => [ID]),
    setCollectionMembers: jest.fn(async () => undefined),
    existingSeries: jest.fn(async (ids: string[]) => ids),
  };
  const changeSet = {
    id: SET,
    idIfWritten: SET,
    add: jest.fn(async () => undefined),
  };
  const changeLog = {
    open: jest.fn(() => changeSet),
    record: jest.fn(async () => SET),
    changeSet: jest.fn(async () => changeRows),
    markUndone: jest.fn(async () => undefined),
    list: jest.fn(async () => ({ total: 0, offset: 0, items: [] })),
  };
  const comicsService = {
    createSeries: jest.fn(async () => ({ id: OTHER })),
    moveBooksToSeries: jest.fn(),
    mergeSeries: jest.fn(),
    unlockBookField: jest.fn(),
    verifySeriesNotBlacklisted: jest.fn(),
  };
  const collections = {
    findAll: jest.fn(async () => ({ collections: [], total: 0 })),
    findOne: jest.fn(),
    create: jest.fn(async () => ({ id: OTHER })),
    update: jest.fn(),
    addSeries: jest.fn(),
    removeSeries: jest.fn(),
    reorder: jest.fn(),
  };
  const comicvineService = {
    getApiKey: jest.fn(async () => 'key'),
    getSeriesLink: jest.fn(async () => null),
    linkSeriesToVolumeId: jest.fn(async () => ({
      comicvineVolumeId: 42,
      name: 'Wolverine',
      startYear: 2010,
      publisherName: 'Marvel',
      countOfIssues: 20,
    })),
    queueSeriesBooks: jest.fn(async () => 3),
  };
  const goodreadsQueue = { enqueue: jest.fn() };

  const edit = new McpEditService(access, store as never, changeLog as never);
  const structure = new McpStructureService(
    fakeDb(() => []) as never,
    access,
    store as never,
    comicsService as never,
    changeLog as never,
    {
      forComicSeries: jest.fn(
        async (ids: string[]) =>
          new Map(
            ids.map((id) => [
              id,
              { title: SHOWN_TITLES[id], publisher: null, startYear: null },
            ]),
          ),
      ),
    } as never,
  );
  const collectionTools = new McpCollectionsService(
    access,
    store as never,
    collections as never,
    changeLog as never,
  );
  const undo = new McpUndoService(
    access,
    store as never,
    structure,
    changeLog as never,
  );
  const link = new McpLinkService(
    access,
    store as never,
    comicvineService as never,
    {} as never,
    { assertMediaExists: jest.fn(), getGoodreadsLink: jest.fn() } as never,
    goodreadsQueue as never,
    changeLog as never,
  );
  const tools = new McpWriteTools(
    access,
    changeLog as never,
    edit,
    structure,
    collectionTools,
    undo,
    link,
  );

  return {
    tools,
    store,
    changeLog,
    changeSet,
    comicsService,
    collections,
    comicvineService,
    goodreadsQueue,
  };
}

async function connect(as: AuthenticatedUser) {
  currentUser = as;
  const built = build();
  const server = new McpServer({ name: 'test', version: '1' });
  built.tools.register(server, as);
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

function json<T>(result: CallToolResult): T {
  expect(result.isError).toBeFalsy();
  return JSON.parse(textOf(result)) as T;
}

/** One valid call per tool that needs permission to edit metadata. */
const EDIT_TOOLS: [string, Record<string, unknown>][] = [
  [
    'update_item',
    { mediaType: 'comic', id: ID, fields: { title: 'Issue one' } },
  ],
  ['update_series', { mediaType: 'comic', id: ID, fields: { title: 'X' } }],
  ['unlock_field', { mediaType: 'comic', id: ID, field: 'title' }],
  ['set_main_characters', { seriesId: ID, names: ['Wolverine'] }],
  ['create_series', { title: 'Wolverine', startYear: 2010 }],
  ['move_items', { issueIds: [ID], targetSeriesId: OTHER }],
  ['merge_series', { sourceSeriesIds: [ID], targetSeriesId: OTHER }],
  ['create_collection', { name: 'Wolverine solo series' }],
  ['update_collection', { id: ID, fields: { name: 'Solo' } }],
  ['add_to_collection', { id: ID, seriesIds: [OTHER] }],
  ['remove_from_collection', { id: ID, seriesIds: [ID] }],
  ['reorder_collection', { id: ID, seriesIds: [ID] }],
  ['list_changes', {}],
  ['undo_change', { changeSetId: SET }],
];

describe('MCP write tools', () => {
  beforeEach(() => {
    stored = { value: 'Old', locked: false };
    changeRows = [];
  });

  it('marks each tool by what it does to existing data', async () => {
    const { client } = await connect(admin);
    const { tools } = await client.listTools();
    const hints = Object.fromEntries(
      tools.map((t) => [
        t.name,
        t.annotations?.readOnlyHint
          ? 'read'
          : t.annotations?.destructiveHint
            ? 'overwrites'
            : 'adds',
      ]),
    );

    expect(hints).toEqual({
      link_external: 'overwrites',
      update_item: 'overwrites',
      update_series: 'overwrites',
      unlock_field: 'overwrites',
      set_main_characters: 'overwrites',
      create_series: 'adds',
      move_items: 'overwrites',
      merge_series: 'overwrites',
      list_collections: 'read',
      get_collection: 'read',
      create_collection: 'adds',
      update_collection: 'overwrites',
      add_to_collection: 'adds',
      remove_from_collection: 'overwrites',
      reorder_collection: 'overwrites',
      list_changes: 'read',
      undo_change: 'overwrites',
    });
  });

  describe.each(EDIT_TOOLS)('%s', (tool, args) => {
    it('refuses a user who cannot edit metadata', async () => {
      const { call, store, changeLog, comicsService, collections } =
        await connect(reader);
      const result = await call(tool, args);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        'You do not have permission to edit metadata',
      );
      expect(store.write).not.toHaveBeenCalled();
      expect(store.unlock).not.toHaveBeenCalled();
      expect(comicsService.createSeries).not.toHaveBeenCalled();
      expect(comicsService.moveBooksToSeries).not.toHaveBeenCalled();
      expect(comicsService.mergeSeries).not.toHaveBeenCalled();
      expect(collections.create).not.toHaveBeenCalled();
      expect(collections.addSeries).not.toHaveBeenCalled();
      expect(collections.removeSeries).not.toHaveBeenCalled();
      expect(collections.reorder).not.toHaveBeenCalled();
      expect(changeLog.record).not.toHaveBeenCalled();
      expect(changeLog.open).not.toHaveBeenCalled();
      expect(changeLog.list).not.toHaveBeenCalled();
    });
  });

  describe('link_external', () => {
    it('refuses ComicVine to a user who is not an admin', async () => {
      const { call, comicvineService } = await connect(editor);
      const result = await call('link_external', {
        mediaType: 'comic',
        id: ID,
        externalId: 42,
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('ComicVine is for admins only');
      expect(comicvineService.linkSeriesToVolumeId).not.toHaveBeenCalled();
    });

    it('refuses Goodreads to a user who is not an admin', async () => {
      const { call, goodreadsQueue } = await connect(editor);
      const result = await call('link_external', {
        mediaType: 'ebook',
        id: ID,
        source: 'goodreads',
        externalId: '123',
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Goodreads is for admins only');
      expect(goodreadsQueue.enqueue).not.toHaveBeenCalled();
    });

    it('links a series to a volume, queues its issues and logs it', async () => {
      const { call, comicvineService, changeLog } = await connect(admin);
      const result = json<{ issuesQueued: number; changeSetId: string }>(
        await call('link_external', {
          mediaType: 'comic',
          id: ID,
          externalId: '42',
        }),
      );

      expect(comicvineService.linkSeriesToVolumeId).toHaveBeenCalledWith(
        ID,
        42,
      );
      expect(comicvineService.queueSeriesBooks).toHaveBeenCalledWith(ID);
      expect(result).toMatchObject({ issuesQueued: 3, changeSetId: SET });
      expect(changeLog.record).toHaveBeenCalledWith(admin, 'link_external', [
        {
          entityType: 'comic_series',
          entityId: ID,
          field: 'link:comicvine',
          before: { id: null },
          after: { id: 42, name: 'Wolverine', startYear: 2010 },
        },
      ]);
    });
  });

  describe('merge_series', () => {
    it('names series by the title the app shows on a dry run', async () => {
      const { call, comicsService } = await connect(editor);
      const result = json<{
        target: object;
        wouldDeleteSeries: object[];
      }>(
        await call('merge_series', {
          sourceSeriesIds: [ID],
          targetSeriesId: OTHER,
          dryRun: true,
        }),
      );

      expect(result.target).toEqual({ id: OTHER, title: 'X-Men (1991)' });
      expect(result.wouldDeleteSeries).toEqual([
        expect.objectContaining({ id: ID, title: 'Wolverine (2010)' }),
      ]);
      expect(comicsService.mergeSeries).not.toHaveBeenCalled();
    });
  });

  describe('update_item', () => {
    it('changes nothing on a dry run', async () => {
      const { call, store, changeLog } = await connect(editor);
      const result = json<object>(
        await call('update_item', {
          mediaType: 'comic',
          ids: [ID, OTHER],
          fields: { format: 'annual' },
          dryRun: true,
        }),
      );

      expect(result).toEqual({
        dryRun: true,
        wouldUpdate: 2,
        items: [
          { id: ID, fields: { format: { from: 'Old', to: 'annual' } } },
          { id: OTHER, fields: { format: { from: 'Old', to: 'annual' } } },
        ],
      });
      expect(store.write).not.toHaveBeenCalled();
      expect(changeLog.open).not.toHaveBeenCalled();
    });

    it('writes, then logs the stored value and lock before and after', async () => {
      const { call, store, changeSet } = await connect(editor);
      store.read
        .mockResolvedValueOnce({ title: { value: 'Old', locked: false } })
        .mockResolvedValueOnce({ title: { value: 'New', locked: true } });

      const result = json<{ changeSetId: string }>(
        await call('update_item', {
          mediaType: 'audiobook',
          id: ID,
          fields: { title: 'New' },
        }),
      );

      expect(store.write).toHaveBeenCalledWith(editor, 'audiobook', ID, {
        title: 'New',
      });
      expect(changeSet.add).toHaveBeenCalledWith([
        {
          entityType: 'audiobook',
          entityId: ID,
          field: 'title',
          before: { value: 'Old', locked: false },
          after: { value: 'New', locked: true },
        },
      ]);
      expect(result.changeSetId).toBe(SET);
    });

    it('refuses a field the media type does not have', async () => {
      const { call, store } = await connect(editor);
      const result = await call('update_item', {
        mediaType: 'ebook',
        id: ID,
        fields: { narrators: ['Someone'] },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('An ebook has no narrators');
      expect(store.write).not.toHaveBeenCalled();
    });
  });

  describe('checkFields', () => {
    it('keeps only the fields that were sent', () => {
      expect(
        checkFields('comic_series', { title: 'X', description: undefined }),
      ).toEqual({ title: 'X' });
    });

    it('refuses to empty a required field', () => {
      expect(() => checkFields('audiobook', { title: '  ' })).toThrow(
        'title cannot be empty',
      );
    });

    it('leaves main characters and moves to their own tools', () => {
      expect(() =>
        checkFields('comic_series', { mainCharacters: ['Rogue'] }),
      ).toThrow('A comic series has no mainCharacters');
      expect(() => checkFields('comic_issue', { series: OTHER })).toThrow(
        'A comic issue has no series',
      );
    });

    it('refuses an issue list it cannot read', () => {
      expect(() =>
        checkFields('comic_issue', { collects: '#1-5, banana' }),
      ).toThrow('collects has issue numbers it cannot read');
    });
  });

  describe('unlock_field', () => {
    it('says which fields are locked when the field is not', async () => {
      const { call, store } = await connect(editor);
      const result = await call('unlock_field', {
        mediaType: 'comic',
        id: ID,
        field: 'summary',
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('summary is not locked. Locked now: title');
      expect(store.unlock).not.toHaveBeenCalled();
    });

    it('takes a lock key as well as a field name', async () => {
      const { call, store } = await connect(editor);
      store.lockedFields.mockResolvedValueOnce(['authors']);
      const result = await call('unlock_field', {
        mediaType: 'audiobook',
        id: ID,
        field: 'author',
      });

      expect(result.isError).toBeFalsy();
      expect(store.unlock).toHaveBeenCalledWith('audiobook', ID, 'authors');
    });
  });

  describe('set_main_characters', () => {
    it('needs one to three names after trimming', async () => {
      const { call, store } = await connect(editor);
      const result = await call('set_main_characters', {
        seriesId: ID,
        names: [' ', '  '],
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Give one to 3 main characters');
      expect(store.write).not.toHaveBeenCalled();
    });
  });

  describe('undo_change', () => {
    const titleRow = (over: Partial<ChangeRow> = {}): Partial<ChangeRow> => ({
      id: 'row-1',
      changeSetId: SET,
      tool: 'update_series',
      entityType: 'comic_series',
      entityId: ID,
      field: 'title',
      before: { value: 'Old', locked: false },
      after: { value: 'New', locked: true },
      undoneBy: null,
      ...over,
    });

    it('puts back the value and the lock state', async () => {
      changeRows = [titleRow()];
      stored = { value: 'New', locked: true };
      const { call, store, changeLog, changeSet } = await connect(editor);

      const result = json<{ undone: number }>(
        await call('undo_change', { changeSetId: SET }),
      );

      expect(result.undone).toBe(1);
      expect(store.write).toHaveBeenCalledWith(editor, 'comic_series', ID, {
        title: 'Old',
      });
      expect(store.unlock).toHaveBeenCalledWith('comic_series', ID, 'title');
      expect(changeSet.add).toHaveBeenCalled();
      expect(changeLog.markUndone).toHaveBeenCalledWith(['row-1'], SET);
    });

    it('skips a value changed again since, unless forced', async () => {
      changeRows = [titleRow()];
      stored = { value: 'Edited later', locked: true };
      const { call, store } = await connect(editor);

      const result = await call('undo_change', { changeSetId: SET });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Changed again since');
      expect(store.write).not.toHaveBeenCalled();

      const forced = await call('undo_change', {
        changeSetId: SET,
        force: true,
      });
      expect(forced.isError).toBeFalsy();
      expect(store.write).toHaveBeenCalled();
    });

    it('refuses a merge', async () => {
      changeRows = [titleRow({ tool: 'merge_series', field: 'deleted' })];
      const { call, store } = await connect(editor);
      const result = await call('undo_change', { changeSetId: SET });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(MERGE_NOT_UNDONE);
      expect(store.write).not.toHaveBeenCalled();
    });

    it('lists what it cannot undo on a dry run', async () => {
      changeRows = [
        titleRow({ field: 'created', before: null, after: { title: 'X' } }),
        titleRow({ id: 'row-2' }),
      ];
      stored = { value: 'New', locked: true };
      const { call, store } = await connect(editor);

      const result = json<{
        wouldUndo: { field: string; to: unknown }[];
        skipped: { field: string }[];
      }>(await call('undo_change', { changeSetId: SET, dryRun: true }));

      expect(result.wouldUndo).toEqual([
        expect.objectContaining({ field: 'title', from: 'New', to: 'Old' }),
      ]);
      expect(result.skipped).toEqual([
        expect.objectContaining({ field: 'created' }),
      ]);
      expect(store.write).not.toHaveBeenCalled();
    });

    it('refuses a change set that is already undone', async () => {
      changeRows = [titleRow({ undoneBy: OTHER })];
      const { call } = await connect(editor);
      const result = await call('undo_change', { changeSetId: SET });

      expect(textOf(result)).toBe('This change set is already undone');
    });
  });

  describe('tidy_comics prompt', () => {
    it('carries the preferences given and asks about the rest', () => {
      const text = tidyComicsText({
        scope: 'Wolverine',
        descriptions: 'keep',
        approval: 'batch',
      });

      expect(text).toContain('matching "Wolverine"');
      expect(text).toContain("Keep ComicVine's descriptions");
      expect(text).toContain('Values from the files: not given');
      expect(text).toContain('Show me a plan for a few series at a time');
    });
  });
});
