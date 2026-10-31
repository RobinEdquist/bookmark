import { Injectable } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { MAX_MAIN_CHARACTERS } from '../comics/comic-main-characters';
import { McpAccessService } from './mcp-access.service';
import {
  LIST_CHANGES_DEFAULT_LIMIT,
  McpChangeLogService,
} from './mcp-change-log.service';
import { MAX_BULK_IDS, McpEditService } from './mcp-edit.service';
import {
  MAX_MERGE_SOURCES,
  MAX_MOVE_ISSUES,
  McpStructureService,
} from './mcp-structure.service';
import {
  LIST_COLLECTIONS_DEFAULT_LIMIT,
  MAX_COLLECTION_SERIES,
  McpCollectionsService,
} from './mcp-collections.service';
import {
  GET_READING_LIST_DEFAULT_LIMIT,
  LIST_READING_LISTS_DEFAULT_LIMIT,
  McpReadingListsService,
} from './mcp-reading-lists.service';
import { MAX_READING_LIST_ITEMS } from '../reading-lists/reading-list-order';
import { McpUndoService } from './mcp-undo.service';
import { LINK_SOURCES, McpLinkService } from './mcp-link.service';
import {
  ENTITY_TYPES,
  editableFields,
  itemFieldsSchema,
  mediaTypeSchema as mediaType,
  seriesFieldsSchema,
} from './mcp-fields';
import { ADDS, OVERWRITES, READ_ONLY, jsonResult } from './mcp-tool-result';

const dryRun = z
  .boolean()
  .optional()
  .describe('Return what would change without changing anything');

const bulkIds = z
  .array(z.uuid())
  .min(1)
  .max(MAX_BULK_IDS)
  .optional()
  .describe(`Several ids getting the same fields, at most ${MAX_BULK_IDS}`);

const seriesIds = (what: string) =>
  z.array(z.uuid()).min(1).max(MAX_COLLECTION_SERIES).describe(what);

const itemIds = (what: string) =>
  z
    .array(z.uuid())
    .min(1)
    .max(MAX_READING_LIST_ITEMS)
    .describe(`${what}. Comics: issue ids, not series ids`);

const fieldList = (type: Parameters<typeof editableFields>[0]) =>
  editableFields(type).join(', ');

/**
 * The tools that change the library, the change log tools and the
 * collection and reading list lookups. Each repeats the guard of its REST route (edit
 * metadata, or admin for external links) and records what it changed.
 */
@Injectable()
export class McpWriteTools {
  constructor(
    private readonly access: McpAccessService,
    private readonly changeLog: McpChangeLogService,
    private readonly edit: McpEditService,
    private readonly structure: McpStructureService,
    private readonly collections: McpCollectionsService,
    private readonly readingLists: McpReadingListsService,
    private readonly undo: McpUndoService,
    private readonly link: McpLinkService,
  ) {}

  register(server: McpServer, user: AuthenticatedUser): void {
    this.registerFixTools(server, user);
    this.registerStructureTools(server, user);
    this.registerCollectionTools(server, user);
    this.registerReadingListTools(server, user);
    this.registerChangeLogTools(server, user);
  }

  private registerFixTools(server: McpServer, user: AuthenticatedUser): void {
    server.registerTool(
      'link_external',
      {
        title: 'Link to an external record',
        description:
          'Link an item or series to an external record, replacing any link it has. Admins only. ' +
          'comic: comicvine. For a series give a volume id: the series links now and its unlinked issues are queued to be matched to that volume. For an issue give an issue id. ' +
          'audiobook and ebook: hardcover (default; also pass the search `query` that found the book) or goodreads (queued, can take minutes). ' +
          'Unlocked fields then show the linked data, following the metadata priority settings.',
        inputSchema: {
          mediaType,
          id: z.uuid().describe('Bookmark id of the series or item'),
          level: z
            .enum(['item', 'series'])
            .optional()
            .describe(
              'Comics: whether id is a series or an issue. Found from the id when left out',
            ),
          source: z.enum(LINK_SOURCES).optional(),
          externalId: z
            .union([z.string().min(1), z.number().int().positive()])
            .describe('The id from search_external or get_match_candidates'),
          query: z
            .string()
            .optional()
            .describe('Hardcover: the search text that found the book'),
        },
        annotations: { ...OVERWRITES, openWorldHint: true },
      },
      ({ externalId, ...args }) =>
        jsonResult(() =>
          this.link.link(user, { ...args, externalId: String(externalId) }),
        ),
    );

    server.registerTool(
      'update_item',
      {
        title: 'Update item',
        description:
          'Set metadata fields on one item or several (the same values on each). Each field sent is locked, like a hand-edit, so syncs and rescans keep it; fields not sent are untouched. ' +
          `comic issue: ${fieldList('comic_issue')}. ` +
          `audiobook: ${fieldList('audiobook')}. ` +
          `ebook: ${fieldList('ebook')}. ` +
          'Lists (authors, genres, creators) replace the whole list. Move issues with move_items. Needs permission to edit metadata.',
        inputSchema: {
          mediaType,
          id: z.uuid().optional(),
          ids: bulkIds,
          fields: itemFieldsSchema,
          dryRun,
        },
        annotations: OVERWRITES,
      },
      ({ mediaType: type, ...args }) =>
        jsonResult(() => this.edit.updateItems(user, type, args)),
    );

    server.registerTool(
      'update_series',
      {
        title: 'Update series',
        description:
          'Set metadata fields on one series or several. Each field sent is locked, like a hand-edit. ' +
          `comic: ${fieldList('comic_series')}. ` +
          'audiobook and ebook series (shared by both): name. ' +
          'Set main characters with set_main_characters. Needs permission to edit metadata.',
        inputSchema: {
          mediaType,
          id: z.uuid().optional(),
          ids: bulkIds,
          fields: seriesFieldsSchema,
          dryRun,
        },
        annotations: OVERWRITES,
      },
      ({ mediaType: type, ...args }) =>
        jsonResult(() => this.edit.updateSeries(user, type, args)),
    );

    server.registerTool(
      'unlock_field',
      {
        title: 'Unlock field',
        description:
          'Remove the lock on a hand-edited field so the metadata priority settings apply again (for example ComicVine). ' +
          'The stored value stays and shows if no other source has one; a file value that a hand-edit replaced only comes back when the file is read again. ' +
          'Errors list which fields are locked. Needs permission to edit metadata.',
        inputSchema: {
          mediaType,
          level: z
            .enum(['item', 'series'])
            .optional()
            .describe(
              'Comics: whether id is a series or an issue. Found from the id when left out',
            ),
          id: z.uuid(),
          field: z
            .string()
            .describe('Field name as get_item or get_series shows it'),
        },
        annotations: OVERWRITES,
      },
      (args) => jsonResult(() => this.edit.unlockField(user, args)),
    );

    server.registerTool(
      'set_main_characters',
      {
        title: 'Set main characters',
        description:
          `The one to ${MAX_MAIN_CHARACTERS} characters or teams a comic series is about, in order. Not everyone who appears: those are the issues' character tags. ` +
          'Replaces the current main characters and locks them. Names match existing characters regardless of case. Needs permission to edit metadata.',
        inputSchema: {
          seriesId: z.uuid(),
          names: z.array(z.string().min(1)).min(1).max(MAX_MAIN_CHARACTERS),
        },
        annotations: OVERWRITES,
      },
      ({ seriesId, names }) =>
        jsonResult(() => this.edit.setMainCharacters(user, seriesId, names)),
    );
  }

  private registerStructureTools(
    server: McpServer,
    user: AuthenticatedUser,
  ): void {
    server.registerTool(
      'create_series',
      {
        title: 'Create comic series',
        description:
          'Create an empty comic series to move issues into, e.g. to split a junk-drawer series. Name it "Title (Start year)" style through title and startYear. Needs permission to edit metadata.',
        inputSchema: {
          title: z.string().min(1),
          publisher: z.string().nullable().optional(),
          startYear: z.number().int().min(1800).max(2200).nullable().optional(),
        },
        annotations: ADDS,
      },
      (args) => jsonResult(() => this.structure.createSeries(user, args)),
    );

    server.registerTool(
      'move_items',
      {
        title: 'Move comic issues',
        description:
          'Move comic issues to another series. Each issue is pinned there so rescans keep it. ' +
          'A series left with no issues is deleted; its details stay in the change log. Run with dryRun first. ' +
          'Undo moves issues back if their old series still exists. Needs permission to edit metadata.',
        inputSchema: {
          issueIds: z.array(z.uuid()).min(1).max(MAX_MOVE_ISSUES),
          targetSeriesId: z.uuid(),
          dryRun,
        },
        annotations: OVERWRITES,
      },
      (args) => jsonResult(() => this.structure.moveItems(user, args)),
    );

    server.registerTool(
      'merge_series',
      {
        title: 'Merge comic series',
        description:
          'Move every issue of the source series into the target, then delete the emptied sources. ' +
          "The target keeps its own fields and main characters; the sources' are dropped. Run with dryRun first: it lists what each source loses. " +
          'Cannot be undone; the change log keeps each deleted series so it can be rebuilt by hand. Needs permission to edit metadata.',
        inputSchema: {
          sourceSeriesIds: z.array(z.uuid()).min(1).max(MAX_MERGE_SOURCES),
          targetSeriesId: z.uuid(),
          dryRun,
        },
        annotations: { ...OVERWRITES, idempotentHint: false },
      },
      (args) => jsonResult(() => this.structure.mergeSeries(user, args)),
    );
  }

  private registerCollectionTools(
    server: McpServer,
    user: AuthenticatedUser,
  ): void {
    server.registerTool(
      'list_collections',
      {
        title: 'List comic collections',
        description:
          'Comic collections (hand-made, ordered groups of series) with how many series each holds. Paged.',
        inputSchema: {
          search: z.string().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe(`Page size, default ${LIST_COLLECTIONS_DEFAULT_LIMIT}`),
          offset: z.number().int().min(0).optional(),
        },
        annotations: READ_ONLY,
      },
      (args) => jsonResult(() => this.collections.list(args)),
    );

    server.registerTool(
      'get_collection',
      {
        title: 'Get comic collection',
        description: 'A comic collection with its series in order.',
        inputSchema: { id: z.uuid() },
        annotations: READ_ONLY,
      },
      ({ id }) => jsonResult(() => this.collections.get(user, id)),
    );

    server.registerTool(
      'create_collection',
      {
        title: 'Create comic collection',
        description:
          'Create a comic collection, e.g. "Wolverine solo series", optionally with its first series in order. Needs permission to edit metadata.',
        inputSchema: {
          name: z.string().min(1),
          sortName: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          seriesIds: seriesIds('Series to add, in order').optional(),
        },
        annotations: ADDS,
      },
      (args) => jsonResult(() => this.collections.create(user, args)),
    );

    server.registerTool(
      'update_collection',
      {
        title: 'Update comic collection',
        description:
          'Set a comic collection’s name, sortName or description. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid(),
          fields: z.strictObject({
            name: z.string().optional(),
            sortName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
          }),
          dryRun,
        },
        annotations: OVERWRITES,
      },
      ({ id, fields, dryRun: preview }) =>
        jsonResult(() =>
          this.edit.updateCollection(user, { id, fields, dryRun: preview }),
        ),
    );

    server.registerTool(
      'add_to_collection',
      {
        title: 'Add series to collection',
        description:
          'Add comic series to the end of a collection, in the order given. Series already in it stay where they are. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Collection id'),
          seriesIds: seriesIds('Series to add'),
        },
        annotations: { ...ADDS, idempotentHint: true },
      },
      ({ id, seriesIds: ids }) =>
        jsonResult(() => this.collections.addSeries(user, id, ids)),
    );

    server.registerTool(
      'remove_from_collection',
      {
        title: 'Remove series from collection',
        description:
          'Take comic series out of a collection. The series themselves are not changed. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Collection id'),
          seriesIds: seriesIds('Series to remove'),
        },
        annotations: OVERWRITES,
      },
      ({ id, seriesIds: ids }) =>
        jsonResult(() => this.collections.removeSeries(user, id, ids)),
    );

    server.registerTool(
      'reorder_collection',
      {
        title: 'Reorder collection',
        description:
          'Set the order of a comic collection. Give every series in it, each once. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Collection id'),
          seriesIds: seriesIds('All series in the collection, in order'),
        },
        annotations: OVERWRITES,
      },
      ({ id, seriesIds: ids }) =>
        jsonResult(() => this.collections.reorder(user, id, ids)),
    );
  }

  private registerReadingListTools(
    server: McpServer,
    user: AuthenticatedUser,
  ): void {
    server.registerTool(
      'list_reading_lists',
      {
        title: 'List reading lists',
        description:
          'Reading lists (shared, ordered lists of items across series, such as an event in reading order) with how many items each holds. ' +
          'Filter by library, name, or an item the list holds. Paged.',
        inputSchema: {
          mediaType: mediaType.optional(),
          search: z.string().optional(),
          itemId: z
            .uuid()
            .optional()
            .describe('Only lists that hold this issue, audiobook or ebook'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe(`Page size, default ${LIST_READING_LISTS_DEFAULT_LIMIT}`),
          offset: z.number().int().min(0).optional(),
        },
        annotations: READ_ONLY,
      },
      (args) => jsonResult(() => this.readingLists.list(args)),
    );

    server.registerTool(
      'get_reading_list',
      {
        title: 'Get reading list',
        description:
          'A reading list with its items in order: position (0-based), item id, title ("Series #n" for comics) and note. ' +
          'Hidden items and items you have blacklisted are left out.',
        inputSchema: {
          id: z.uuid(),
          offset: z.number().int().min(0).optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(1000)
            .optional()
            .describe(
              `Items to list, default ${GET_READING_LIST_DEFAULT_LIMIT}`,
            ),
        },
        annotations: READ_ONLY,
      },
      ({ id, offset, limit }) =>
        jsonResult(() => this.readingLists.get(user, id, { offset, limit })),
    );

    server.registerTool(
      'create_reading_list',
      {
        title: 'Create reading list',
        description:
          'Create a reading list for one library, e.g. "Civil War" for comics, optionally with its first items in reading order. ' +
          'Collections hold whole series; a reading list holds single issues or books. Needs permission to edit metadata.',
        inputSchema: {
          mediaType,
          name: z.string().min(1),
          sortName: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          itemIds: itemIds('Items to add, in reading order').optional(),
        },
        annotations: ADDS,
      },
      (args) => jsonResult(() => this.readingLists.create(user, args)),
    );

    server.registerTool(
      'update_reading_list',
      {
        title: 'Update reading list',
        description:
          'Set a reading list’s name, sortName or description. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid(),
          fields: z.strictObject({
            name: z.string().optional(),
            sortName: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
          }),
          dryRun,
        },
        annotations: OVERWRITES,
      },
      ({ id, fields, dryRun: preview }) =>
        jsonResult(() =>
          this.edit.updateReadingList(user, { id, fields, dryRun: preview }),
        ),
    );

    server.registerTool(
      'add_to_reading_list',
      {
        title: 'Add to reading list',
        description:
          'Add items in the order given, before `position` (0-based, as get_reading_list shows it) or at the end. ' +
          'Items already in the list stay where they are; move them with reorder_reading_list. ' +
          '`note` labels every item added, e.g. "Tie-in". Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Reading list id'),
          itemIds: itemIds('Items to add, in reading order'),
          position: z.number().int().min(0).optional(),
          note: z.string().nullable().optional(),
        },
        annotations: { ...ADDS, idempotentHint: true },
      },
      ({ id, itemIds: ids, position, note }) =>
        jsonResult(() =>
          this.readingLists.addItems(user, id, ids, { position, note }),
        ),
    );

    server.registerTool(
      'remove_from_reading_list',
      {
        title: 'Remove from reading list',
        description:
          'Take items out of a reading list. The items themselves are not changed. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Reading list id'),
          itemIds: itemIds('Items to remove'),
        },
        annotations: OVERWRITES,
      },
      ({ id, itemIds: ids }) =>
        jsonResult(() => this.readingLists.removeItems(user, id, ids)),
    );

    server.registerTool(
      'reorder_reading_list',
      {
        title: 'Reorder reading list',
        description:
          'Set the order of a reading list. Give every item in it, each once, including any get_reading_list leaves out for you. Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Reading list id'),
          itemIds: itemIds('All items in the list, in reading order'),
        },
        annotations: OVERWRITES,
      },
      ({ id, itemIds: ids }) =>
        jsonResult(() => this.readingLists.reorder(user, id, ids)),
    );

    server.registerTool(
      'set_reading_list_notes',
      {
        title: 'Set reading list notes',
        description:
          'Set or clear the short note on items in a reading list, e.g. "Core" or "Tie-in". Needs permission to edit metadata.',
        inputSchema: {
          id: z.uuid().describe('Reading list id'),
          notes: z
            .array(
              z.object({
                itemId: z.uuid(),
                note: z.string().nullable().describe('null clears it'),
              }),
            )
            .min(1)
            .max(MAX_READING_LIST_ITEMS),
        },
        annotations: OVERWRITES,
      },
      ({ id, notes }) =>
        jsonResult(() => this.readingLists.setNotes(user, id, notes)),
    );
  }

  private registerChangeLogTools(
    server: McpServer,
    user: AuthenticatedUser,
  ): void {
    server.registerTool(
      'list_changes',
      {
        title: 'List changes',
        description:
          'The change log: every write made through these tools, newest first, one row per field with its value before and after. ' +
          'Rows from one tool call share a changeSetId, which undo_change takes. Long text is shortened unless full is true. Needs permission to edit metadata.',
        inputSchema: {
          entityType: z.enum(ENTITY_TYPES).optional(),
          id: z.uuid().optional().describe('Only changes to this record'),
          changeSetId: z.uuid().optional(),
          mine: z.boolean().optional().describe('Only your own changes'),
          userId: z.string().optional().describe('Only this user’s changes'),
          tool: z.string().optional(),
          full: z.boolean().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe(`Page size, default ${LIST_CHANGES_DEFAULT_LIMIT}`),
          offset: z.number().int().min(0).optional(),
        },
        annotations: READ_ONLY,
      },
      ({ id, mine, userId, ...filters }) =>
        jsonResult(async () => {
          await this.access.requireEditMetadata(user);
          return this.changeLog.list({
            ...filters,
            entityId: id,
            userId: mine ? user.id : userId,
          });
        }),
    );

    server.registerTool(
      'undo_change',
      {
        title: 'Undo change',
        description:
          'Put back the values one change set replaced: field edits, unlocks, main characters, issue moves, and collection and reading list changes. ' +
          'Rows changed again since are skipped unless force is true. Not undone: created series, collections and reading lists, links, and merges (refused; deleted series are rebuilt by hand). ' +
          'The undo is itself a change set. Needs permission to edit metadata.',
        inputSchema: {
          changeSetId: z.uuid(),
          force: z.boolean().optional(),
          dryRun,
        },
        annotations: { ...OVERWRITES, idempotentHint: false },
      },
      (args) => jsonResult(() => this.undo.undo(user, args)),
    );
  }
}
