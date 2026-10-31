import { BadRequestException, Injectable } from '@nestjs/common';
import { ReadingListsService } from '../reading-lists/reading-lists.service';
import {
  MAX_READING_LIST_ITEMS,
  entryKey,
  type MissingItem,
  type ReadingListEntryInput,
  type ReadingListEntryState,
  type ReadingListMediaType,
} from '../reading-lists/reading-list-order';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import { McpChangeLogService } from './mcp-change-log.service';
import { CREATED_FIELD, ITEM_ENTITY, type ChangeEntry } from './mcp-fields';

export const LIST_READING_LISTS_DEFAULT_LIMIT = 25;
export const GET_READING_LIST_DEFAULT_LIMIT = 200;

/** An entry to add: an item id, or an item the library does not have. */
export type McpEntryArg = string | MissingItem;

/**
 * Reading lists: list, read, create, add, remove, reorder and set notes.
 * Editing a list's name and description is update_reading_list in
 * McpEditService. Reading lists are never deleted here.
 *
 * Every entry change is logged as the full ordered entry list (item ids,
 * missing items and notes) before and after, so undo can put back exactly
 * what was there. Entries are named by item id, or for a missing item by its
 * entry id.
 */
@Injectable()
export class McpReadingListsService {
  constructor(
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly readingLists: ReadingListsService,
    private readonly changeLog: McpChangeLogService,
  ) {}

  /** As GET /reading-lists: any signed-in user. */
  async list(args: {
    mediaType?: ReadingListMediaType;
    search?: string;
    itemId?: string;
    limit?: number;
    offset?: number;
  }): Promise<object> {
    const offset = args.offset ?? 0;
    const result = await this.readingLists.findAll({
      mediaType: args.mediaType,
      search: args.search,
      itemId: args.itemId,
      limit: args.limit ?? LIST_READING_LISTS_DEFAULT_LIMIT,
      offset,
    });
    return {
      total: result.total,
      offset,
      items: result.readingLists.map((l) => ({
        id: l.id,
        mediaType: l.mediaType,
        name: l.name,
        items: l.entryCount,
      })),
    };
  }

  /** As GET /reading-lists/:id, which leaves out hidden and blacklisted items. */
  async get(
    user: AuthenticatedUser,
    id: string,
    page: { offset?: number; limit?: number } = {},
  ): Promise<object> {
    const detail = await this.readingLists.findOne(id, user.id);
    const missing = new Map(
      (await this.store.readingListEntries(id)).flatMap((s) =>
        s.missing ? [[s.missing.entryId, s.missing] as const] : [],
      ),
    );
    const offset = page.offset ?? 0;
    const limit = page.limit ?? GET_READING_LIST_DEFAULT_LIMIT;
    return {
      id: detail.id,
      mediaType: detail.mediaType,
      name: detail.name,
      sortName: detail.sortName,
      description: detail.description,
      total: detail.entries.length,
      missing: detail.missingCount,
      offset,
      items: detail.entries.slice(offset, offset + limit).map((e) => {
        const m = e.missing ? missing.get(e.id) : undefined;
        return {
          position: e.position,
          id: e.id,
          title: e.title,
          ...(e.missing ? { missing: true } : {}),
          ...(m?.comicvineIssueId
            ? { comicvineIssueId: m.comicvineIssueId }
            : {}),
          ...(m?.comicvineVolumeId
            ? { comicvineVolumeId: m.comicvineVolumeId, number: m.number }
            : {}),
          ...(e.subtitle ? { subtitle: e.subtitle } : {}),
          ...(e.seriesId ? { seriesId: e.seriesId } : {}),
          ...(e.note ? { note: e.note } : {}),
        };
      }),
    };
  }

  async create(
    user: AuthenticatedUser,
    args: {
      mediaType: ReadingListMediaType;
      name: string;
      sortName?: string | null;
      description?: string | null;
      itemIds?: string[];
      items?: McpEntryArg[];
    },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const name = args.name.trim();
    if (!name) throw new BadRequestException('name cannot be empty');
    const inputs = await this.checkEntries(
      user,
      args.mediaType,
      entryArgs(args.itemIds, args.items, true),
    );

    const { id } = await this.readingLists.create(
      {
        mediaType: args.mediaType,
        name,
        sortName: args.sortName ?? null,
        description: args.description ?? null,
      },
      user.id,
    );
    if (inputs.length > 0) await this.readingLists.addEntries(id, inputs);

    const entries: ChangeEntry[] = [
      {
        entityType: 'reading_list',
        entityId: id,
        field: CREATED_FIELD,
        before: null,
        after: {
          mediaType: args.mediaType,
          name,
          sortName: args.sortName ?? null,
          description: args.description ?? null,
        },
      },
    ];
    const added = await this.store.readingListEntries(id);
    if (added.length > 0) entries.push(entriesEntry(id, [], added));
    const changeSetId = await this.changeLog.record(
      user,
      'create_reading_list',
      entries,
    );
    return {
      changeSetId,
      id,
      name,
      items: added.length,
      missing: added.filter((e) => e.missing).length,
    };
  }

  async addItems(
    user: AuthenticatedUser,
    id: string,
    args: { itemIds?: string[]; items?: McpEntryArg[] },
    options: { position?: number; note?: string | null } = {},
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const mediaType = await this.readingLists.mediaTypeOf(id);
    const wanted = await this.checkEntries(
      user,
      mediaType,
      entryArgs(args.itemIds, args.items, false),
    );
    const before = await this.store.readingListEntries(id);

    const result = await this.readingLists.addEntries(id, wanted, options);
    return this.recordEntries(user, 'add_to_reading_list', id, before, {
      added: result.added,
      alreadyIn: result.alreadyIn,
    });
  }

  async removeItems(
    user: AuthenticatedUser,
    id: string,
    itemIds: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    await this.readingLists.mediaTypeOf(id);
    const before = await this.store.readingListEntries(id);
    const present = new Set(before.map(entryKey));
    const removing = [...new Set(itemIds)].filter((i) => present.has(i));
    if (removing.length === 0) {
      throw new BadRequestException(
        'None of these items are in the reading list',
      );
    }

    await this.readingLists.removeItems(id, removing);
    return this.recordEntries(user, 'remove_from_reading_list', id, before, {
      removed: removing.length,
      notIn: itemIds.length - removing.length,
    });
  }

  async reorder(
    user: AuthenticatedUser,
    id: string,
    itemIds: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    await this.readingLists.mediaTypeOf(id);
    const before = await this.store.readingListEntries(id);

    await this.readingLists.reorder(id, itemIds);
    return this.recordEntries(user, 'reorder_reading_list', id, before, {});
  }

  async setNotes(
    user: AuthenticatedUser,
    id: string,
    notes: { itemId: string; note: string | null }[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    await this.readingLists.mediaTypeOf(id);
    const before = await this.store.readingListEntries(id);
    const present = new Set(before.map(entryKey));
    const notIn = notes.filter((n) => !present.has(n.itemId));
    if (notIn.length > 0) {
      throw new BadRequestException(
        `Not in the reading list: ${notIn.map((n) => n.itemId).join(', ')}`,
      );
    }

    for (const { itemId, note } of notes) {
      await this.readingLists.setNote(id, itemId, note);
    }
    return this.recordEntries(user, 'set_reading_list_notes', id, before, {
      notes: notes.length,
    });
  }

  /**
   * The entries as service input, after checking that each item id is an
   * existing item of the list's type that the user may see.
   */
  private async checkEntries(
    user: AuthenticatedUser,
    mediaType: ReadingListMediaType,
    args: McpEntryArg[],
  ): Promise<ReadingListEntryInput[]> {
    if (args.length > MAX_READING_LIST_ITEMS) {
      throw new BadRequestException(
        `At most ${MAX_READING_LIST_ITEMS} items at a time`,
      );
    }
    const ids = [
      ...new Set(args.filter((a): a is string => typeof a === 'string')),
    ];
    const missing = await this.readingLists.missingItems(mediaType, ids);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Not ${mediaType === 'comic' ? 'comic issues' : `${mediaType}s`}: ${missing.join(', ')}.` +
          (mediaType === 'comic'
            ? ' Give issue ids (from get_series), not series ids.'
            : '') +
          ' Add an item the library does not have as a missing item.',
      );
    }
    for (const id of ids) {
      await this.store.verifyAccess(user, ITEM_ENTITY[mediaType], id);
    }
    return args.map((a) =>
      typeof a === 'string' ? { itemId: a } : { missing: a },
    );
  }

  private async recordEntries(
    user: AuthenticatedUser,
    tool: string,
    id: string,
    before: ReadingListEntryState[],
    counts: Record<string, number>,
  ): Promise<object> {
    const after = await this.store.readingListEntries(id);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const changeSetId = changed
      ? await this.changeLog.record(user, tool, [
          entriesEntry(id, before, after),
        ])
      : null;
    return { changeSetId, id, ...counts, items: after.length };
  }
}

/** `itemIds` and `items` as one list; one of them must be given. */
function entryArgs(
  itemIds: string[] | undefined,
  items: McpEntryArg[] | undefined,
  optional: boolean,
): McpEntryArg[] {
  if (itemIds && items) {
    throw new BadRequestException('Give itemIds or items, not both');
  }
  const args = itemIds ?? items ?? [];
  if (args.length === 0 && !optional) {
    throw new BadRequestException('Give itemIds or items');
  }
  return args;
}

function entriesEntry(
  id: string,
  before: ReadingListEntryState[],
  after: ReadingListEntryState[],
): ChangeEntry {
  return {
    entityType: 'reading_list',
    entityId: id,
    field: 'entries',
    before: { value: before },
    after: { value: after },
  };
}
