import { BadRequestException, Injectable } from '@nestjs/common';
import { ComicsCollectionsService } from '../comics/comics-collections.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import { McpChangeLogService } from './mcp-change-log.service';
import { CREATED_FIELD, type ChangeEntry } from './mcp-fields';

/** How many series one collection call may add, remove or order. */
export const MAX_COLLECTION_SERIES = 200;
export const LIST_COLLECTIONS_DEFAULT_LIMIT = 25;

/**
 * Comic collections: list, read, create, add series, remove series and
 * reorder. Editing a collection's name and description is update_collection
 * in McpEditService. Collections are never deleted here.
 *
 * Every membership change is logged as the full ordered member list before
 * and after, so undo can put back exactly what was there.
 */
@Injectable()
export class McpCollectionsService {
  constructor(
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly collections: ComicsCollectionsService,
    private readonly changeLog: McpChangeLogService,
  ) {}

  /** As GET /comics/collections: any signed-in user. */
  async list(args: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<object> {
    const offset = args.offset ?? 0;
    const result = await this.collections.findAll({
      search: args.search,
      limit: args.limit ?? LIST_COLLECTIONS_DEFAULT_LIMIT,
      offset,
    });
    return {
      total: result.total,
      offset,
      items: result.collections.map((c) => ({
        id: c.id,
        name: c.name,
        series: c.seriesCount,
      })),
    };
  }

  /** As GET /comics/collections/:id, which leaves out blacklisted series. */
  async get(user: AuthenticatedUser, id: string): Promise<object> {
    const detail = await this.collections.findOne(id, user.id);
    return {
      id: detail.id,
      name: detail.name,
      sortName: detail.sortName,
      description: detail.description,
      series: detail.series.map((s) => ({
        id: s.id,
        title: s.title,
        startYear: s.startYear,
        issues: s.bookCount,
        mainCharacters: s.mainCharacters.map((c) => c.name),
      })),
    };
  }

  async create(
    user: AuthenticatedUser,
    args: {
      name: string;
      sortName?: string | null;
      description?: string | null;
      seriesIds?: string[];
    },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const name = args.name.trim();
    if (!name) throw new BadRequestException('name cannot be empty');
    const seriesIds = await this.checkSeries(user, args.seriesIds ?? []);

    const { id } = await this.collections.create({
      name,
      description: args.description ?? null,
    });
    if (args.sortName) {
      await this.collections.update(id, { sortName: args.sortName });
    }
    for (const seriesId of seriesIds) {
      await this.collections.addSeries(id, seriesId);
    }

    const entries: ChangeEntry[] = [
      {
        entityType: 'comic_collection',
        entityId: id,
        field: CREATED_FIELD,
        before: null,
        after: {
          name,
          sortName: args.sortName ?? null,
          description: args.description ?? null,
        },
      },
    ];
    if (seriesIds.length > 0) {
      entries.push(membersEntry(id, [], seriesIds));
    }
    const changeSetId = await this.changeLog.record(
      user,
      'create_collection',
      entries,
    );
    return { changeSetId, id, name, series: seriesIds.length };
  }

  async addSeries(
    user: AuthenticatedUser,
    collectionId: string,
    seriesIds: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const before = await this.members(collectionId);
    const wanted = await this.checkSeries(user, seriesIds);
    const adding = wanted.filter((id) => !before.includes(id));

    for (const seriesId of adding) {
      await this.collections.addSeries(collectionId, seriesId);
    }
    return this.recordMembers(user, 'add_to_collection', collectionId, before, {
      added: adding.length,
      alreadyIn: wanted.length - adding.length,
    });
  }

  async removeSeries(
    user: AuthenticatedUser,
    collectionId: string,
    seriesIds: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const before = await this.members(collectionId);
    const removing = [...new Set(seriesIds)].filter((id) =>
      before.includes(id),
    );
    if (removing.length === 0) {
      throw new BadRequestException(
        'None of these series are in the collection',
      );
    }

    for (const seriesId of removing) {
      await this.collections.removeSeries(collectionId, seriesId);
    }
    return this.recordMembers(
      user,
      'remove_from_collection',
      collectionId,
      before,
      { removed: removing.length, notIn: seriesIds.length - removing.length },
    );
  }

  async reorder(
    user: AuthenticatedUser,
    collectionId: string,
    seriesIds: string[],
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const before = await this.members(collectionId);
    const order = [...new Set(seriesIds)];
    const missing = before.filter((id) => !order.includes(id));
    const extra = order.filter((id) => !before.includes(id));
    if (missing.length > 0 || extra.length > 0) {
      throw new BadRequestException(
        'Give every series in the collection, once, in the new order.' +
          (missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '') +
          (extra.length > 0 ? ` Not in it: ${extra.join(', ')}.` : ''),
      );
    }

    await this.collections.reorder(collectionId, order);
    return this.recordMembers(
      user,
      'reorder_collection',
      collectionId,
      before,
      {},
    );
  }

  /** The member list, after checking the collection exists. */
  private async members(collectionId: string): Promise<string[]> {
    await this.store.read('comic_collection', collectionId, ['name']);
    return this.store.collectionMembers(collectionId);
  }

  /** De-duplicated ids, each an existing series the user may change. */
  private async checkSeries(
    user: AuthenticatedUser,
    seriesIds: string[],
  ): Promise<string[]> {
    const ids = [...new Set(seriesIds)];
    if (ids.length > MAX_COLLECTION_SERIES) {
      throw new BadRequestException(
        `At most ${MAX_COLLECTION_SERIES} series at a time`,
      );
    }
    const existing = new Set(await this.store.existingSeries(ids));
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Comic series not found: ${missing.join(', ')}`,
      );
    }
    for (const id of ids) {
      await this.store.verifyAccess(user, 'comic_series', id);
    }
    return ids;
  }

  private async recordMembers(
    user: AuthenticatedUser,
    tool: string,
    collectionId: string,
    before: string[],
    counts: Record<string, number>,
  ): Promise<object> {
    const after = await this.store.collectionMembers(collectionId);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const changeSetId = changed
      ? await this.changeLog.record(user, tool, [
          membersEntry(collectionId, before, after),
        ])
      : null;
    return { changeSetId, id: collectionId, ...counts, series: after.length };
  }
}

function membersEntry(
  collectionId: string,
  before: string[],
  after: string[],
): ChangeEntry {
  return {
    entityType: 'comic_collection',
    entityId: collectionId,
    field: 'members',
    before: { value: before },
    after: { value: after },
  };
}
