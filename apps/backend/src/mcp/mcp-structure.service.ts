import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { ComicsService } from '../comics/comics.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import * as comicsSchema from '../comics/schema';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import {
  McpChangeLogService,
  type ChangeSetWriter,
} from './mcp-change-log.service';
import {
  CREATED_FIELD,
  DELETED_FIELD,
  FIELDS,
  type ChangeEntry,
} from './mcp-fields';
import { safePath } from './mcp-inspect.service';

/** How many issues one move may take. */
export const MAX_MOVE_ISSUES = 500;
/** How many series one merge may fold into the target. */
export const MAX_MERGE_SOURCES = 20;

export interface MovingBook {
  id: string;
  seriesId: string;
  locked: boolean;
}

interface MovePlan {
  target: { id: string; title: string };
  moving: MovingBook[];
  alreadyInTarget: number;
  sources: { id: string; title: string; moving: number; left: number }[];
}

/**
 * create_series, move_items and merge_series, for comics.
 *
 * Moves go through ComicsService, which pins each issue to its new series and
 * deletes a series the move leaves empty. Before that happens, the series is
 * written to the change log in full (fields, main characters, collections,
 * ComicVine volume, issue ids) so it can be rebuilt by hand. Undo does not
 * rebuild deleted series.
 */
@Injectable()
export class McpStructureService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof comicsSchema>,
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly comicsService: ComicsService,
    private readonly changeLog: McpChangeLogService,
    private readonly metadataResolver: MetadataResolverService,
  ) {}

  async createSeries(
    user: AuthenticatedUser,
    input: {
      title: string;
      publisher?: string | null;
      startYear?: number | null;
    },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const title = input.title.trim();
    if (!title) throw new BadRequestException('title cannot be empty');

    const created = {
      title,
      publisher: input.publisher ?? null,
      startYear: input.startYear ?? null,
    };
    const { id } = await this.comicsService.createSeries(created);
    const changeSetId = await this.changeLog.record(user, 'create_series', [
      {
        entityType: 'comic_series',
        entityId: id,
        field: CREATED_FIELD,
        before: null,
        after: created,
      },
    ]);
    return { changeSetId, id, ...created };
  }

  async moveItems(
    user: AuthenticatedUser,
    args: { issueIds: string[]; targetSeriesId: string; dryRun?: boolean },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const issueIds = [...new Set(args.issueIds)];
    if (issueIds.length > MAX_MOVE_ISSUES) {
      throw new BadRequestException(
        `At most ${MAX_MOVE_ISSUES} issues at a time`,
      );
    }
    const plan = await this.planMove(user, issueIds, args.targetSeriesId);
    const deletes = plan.sources.filter((s) => s.left === 0);

    if (args.dryRun) {
      return {
        dryRun: true,
        target: plan.target,
        wouldMove: plan.moving.length,
        alreadyInTarget: plan.alreadyInTarget,
        from: plan.sources,
        wouldDeleteSeries: deletes.map(({ id, title }) => ({ id, title })),
      };
    }

    const changeSet = this.changeLog.open(user, 'move_items');
    const deleted = await this.applyMove(
      plan.moving,
      args.targetSeriesId,
      changeSet,
    );
    return {
      changeSetId: changeSet.idIfWritten,
      target: plan.target,
      moved: plan.moving.length,
      alreadyInTarget: plan.alreadyInTarget,
      deletedSeries: deleted,
    };
  }

  async mergeSeries(
    user: AuthenticatedUser,
    args: {
      sourceSeriesIds: string[];
      targetSeriesId: string;
      dryRun?: boolean;
    },
  ): Promise<object> {
    await this.access.requireEditMetadata(user);
    const sourceIds = [...new Set(args.sourceSeriesIds)].filter(
      (id) => id !== args.targetSeriesId,
    );
    if (sourceIds.length === 0) {
      throw new BadRequestException(
        'Give at least one series besides the target',
      );
    }
    if (sourceIds.length > MAX_MERGE_SOURCES) {
      throw new BadRequestException(
        `At most ${MAX_MERGE_SOURCES} series at a time`,
      );
    }

    const target = await this.seriesForWrite(user, args.targetSeriesId);
    const sources: { id: string; title: string }[] = [];
    for (const id of sourceIds)
      sources.push(await this.seriesForWrite(user, id));

    const books = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        seriesId: comicsSchema.comicBooks.seriesId,
        manualFields: comicsSchema.comicBooks.manualFields,
      })
      .from(comicsSchema.comicBooks)
      .where(inArray(comicsSchema.comicBooks.seriesId, sourceIds));

    if (args.dryRun) {
      return {
        dryRun: true,
        target,
        wouldMove: books.length,
        wouldDeleteSeries: await Promise.all(
          sources.map(async (s) => ({
            ...s,
            issues: books.filter((b) => b.seriesId === s.id).length,
            ...(await this.whatIsLost(s.id)),
          })),
        ),
      };
    }

    const changeSet = this.changeLog.open(user, 'merge_series');
    const moving = books.map((b) => ({
      id: b.id,
      seriesId: b.seriesId,
      locked: (b.manualFields ?? []).includes('seriesId'),
    }));
    // Emptied sources with no issues are deleted too, so snapshot them all.
    const snapshots = await this.snapshots(sourceIds, moving);
    const result = await this.comicsService.mergeSeries(
      sourceIds,
      args.targetSeriesId,
    );
    await changeSet.add([
      ...moveEntries(moving, args.targetSeriesId),
      ...deletedEntries(snapshots, result.deletedSeriesIds),
    ]);

    return {
      changeSetId: changeSet.idIfWritten,
      target,
      moved: result.moved,
      deletedSeries: sources
        .filter((s) => result.deletedSeriesIds.includes(s.id))
        .map(({ id, title }) => ({ id, title })),
    };
  }

  /**
   * Moves books and records each move, and each series the move empties,
   * in `changeSet`. Shared by move_items and undo, which passes the books
   * whose placement was not pinned before as `unpin`. Returns the deleted
   * series.
   */
  async applyMove(
    moving: MovingBook[],
    targetSeriesId: string,
    changeSet: ChangeSetWriter,
    unpin: ReadonlySet<string> = new Set(),
  ): Promise<{ id: string; title: unknown }[]> {
    if (moving.length === 0) return [];
    const sourceIds = [...new Set(moving.map((b) => b.seriesId))];
    // Resolve titles first: a series the move empties is gone afterwards
    const [snapshots, titles] = await Promise.all([
      this.snapshots(sourceIds, moving),
      this.metadataResolver.forComicSeries(sourceIds),
    ]);
    const result = await this.comicsService.moveBooksToSeries(
      moving.map((b) => b.id),
      targetSeriesId,
    );
    for (const id of unpin) {
      await this.comicsService.unlockBookField(id, 'seriesId');
    }
    await changeSet.add([
      ...moveEntries(moving, targetSeriesId, unpin),
      ...deletedEntries(snapshots, result.deletedSeriesIds),
    ]);
    return result.deletedSeriesIds.map((id) => ({
      id,
      title: titles.get(id)?.title ?? snapshots.get(id)?.title ?? null,
    }));
  }

  private async planMove(
    user: AuthenticatedUser,
    issueIds: string[],
    targetSeriesId: string,
  ): Promise<MovePlan> {
    const target = await this.seriesForWrite(user, targetSeriesId);
    const books = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        seriesId: comicsSchema.comicBooks.seriesId,
        manualFields: comicsSchema.comicBooks.manualFields,
      })
      .from(comicsSchema.comicBooks)
      .where(inArray(comicsSchema.comicBooks.id, issueIds));

    const found = new Set(books.map((b) => b.id));
    const missing = issueIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Comic issues not found: ${missing.join(', ')}`,
      );
    }

    const moving = books
      .filter((b) => b.seriesId !== targetSeriesId)
      .map((b) => ({
        id: b.id,
        seriesId: b.seriesId,
        locked: (b.manualFields ?? []).includes('seriesId'),
      }));
    const sourceIds = [...new Set(moving.map((b) => b.seriesId))];
    const sources: { id: string; title: string }[] = [];
    for (const id of sourceIds) {
      sources.push(await this.seriesForWrite(user, id));
    }

    const counts = await this.issueCounts(sourceIds);
    return {
      target,
      moving,
      alreadyInTarget: books.length - moving.length,
      sources: sources.map((s) => {
        const count = moving.filter((b) => b.seriesId === s.id).length;
        return {
          ...s,
          moving: count,
          left: (counts.get(s.id) ?? 0) - count,
        };
      }),
    };
  }

  /** A series the user may change, as `{ id, title }` with the shown title. */
  private async seriesForWrite(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ id: string; title: string }> {
    await this.store.verifyAccess(user, 'comic_series', id);
    const series = (await this.metadataResolver.forComicSeries([id])).get(id);
    if (!series) throw new NotFoundException(`Comic series not found: ${id}`);
    return { id, title: series.title };
  }

  /** Issues per series, every status included, as the delete check counts. */
  private async issueCounts(seriesIds: string[]): Promise<Map<string, number>> {
    if (seriesIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        seriesId: comicsSchema.comicBooks.seriesId,
        count: sql<number>`count(*)::int`,
      })
      .from(comicsSchema.comicBooks)
      .where(inArray(comicsSchema.comicBooks.seriesId, seriesIds))
      .groupBy(comicsSchema.comicBooks.seriesId);
    return new Map(rows.map((r) => [r.seriesId, r.count]));
  }

  /** What a merge drops with each source: kept in the change log only. */
  private async whatIsLost(seriesId: string): Promise<object> {
    const snapshot = await this.snapshot(seriesId, []);
    const lost = {
      mainCharacters: snapshot.mainCharacters,
      collections: (snapshot.collections as { name: string }[]).map(
        (c) => c.name,
      ),
      comicvineVolumeId: snapshot.comicvineVolumeId,
    };
    return Object.fromEntries(
      Object.entries(lost).filter(
        ([, v]) => v !== null && !(Array.isArray(v) && v.length === 0),
      ),
    );
  }

  private async snapshots(
    seriesIds: string[],
    moving: MovingBook[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const result = new Map<string, Record<string, unknown>>();
    for (const id of seriesIds) {
      const issueIds = moving.filter((b) => b.seriesId === id).map((b) => b.id);
      result.set(id, await this.snapshot(id, issueIds));
    }
    return result;
  }

  /**
   * Everything needed to rebuild a series by hand: its fields, locks, main
   * characters, collections, ComicVine volume, folder and issue ids.
   */
  private async snapshot(
    seriesId: string,
    issueIds: string[],
  ): Promise<Record<string, unknown>> {
    const fields = Object.keys(FIELDS.comic_series);
    const [state, [row], collections] = await Promise.all([
      this.store.read('comic_series', seriesId, fields),
      this.db
        .select({
          folderPath: comicsSchema.comicSeries.folderPath,
          comicvineVolumeId: comicsSchema.comicSeries.comicvineVolumeId,
        })
        .from(comicsSchema.comicSeries)
        .where(eq(comicsSchema.comicSeries.id, seriesId))
        .limit(1),
      this.db
        .select({
          id: comicsSchema.comicCollections.id,
          name: comicsSchema.comicCollections.name,
          position: comicsSchema.comicCollectionSeries.position,
        })
        .from(comicsSchema.comicCollectionSeries)
        .innerJoin(
          comicsSchema.comicCollections,
          eq(
            comicsSchema.comicCollectionSeries.collectionId,
            comicsSchema.comicCollections.id,
          ),
        )
        .where(eq(comicsSchema.comicCollectionSeries.seriesId, seriesId))
        .orderBy(asc(comicsSchema.comicCollections.name)),
    ]);

    return {
      ...Object.fromEntries(fields.map((f) => [f, state[f].value])),
      locked: fields.filter((f) => state[f].locked),
      folder: safePath(row?.folderPath),
      comicvineVolumeId: row?.comicvineVolumeId ?? null,
      collections,
      issueIds,
    };
  }
}

function moveEntries(
  moving: MovingBook[],
  targetSeriesId: string,
  unpin: ReadonlySet<string> = new Set(),
): ChangeEntry[] {
  return moving.map((book) => ({
    entityType: 'comic_issue',
    entityId: book.id,
    field: 'series',
    before: { value: book.seriesId, locked: book.locked },
    after: { value: targetSeriesId, locked: !unpin.has(book.id) },
  }));
}

function deletedEntries(
  snapshots: Map<string, Record<string, unknown>>,
  deletedIds: string[],
): ChangeEntry[] {
  return deletedIds.map((id) => ({
    entityType: 'comic_series',
    entityId: id,
    field: DELETED_FIELD,
    before: snapshots.get(id) ?? null,
    after: null,
  }));
}
