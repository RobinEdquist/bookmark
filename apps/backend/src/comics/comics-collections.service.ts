import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, ilike, ne, notExists, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as usersSchema from '../users/schema';
import * as comicvineSchema from '../comicvine/schema';
import { CoverService } from '../common/cover.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import { reorderPositions, resolveCollectionCover } from './collections.helpers';

type Db = NodePgDatabase<
  typeof schema &
    typeof audiobooksSchema &
    typeof usersSchema &
    typeof comicvineSchema
>;

interface ListCollectionsFilters {
  search?: string;
  sortBy?: 'name' | 'recentlyAdded';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class ComicsCollectionsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: Db,
    private coverService: CoverService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  async findAll(filters: ListCollectionsFilters = {}) {
    const { search, sortBy = 'name', sortOrder = 'asc', limit = 50, offset = 0 } = filters;
    const conditions = search ? [ilike(schema.comicCollections.name, `%${search}%`)] : [];

    const orderBy =
      sortBy === 'recentlyAdded'
        ? sortOrder === 'asc'
          ? asc(schema.comicCollections.createdAt)
          : desc(schema.comicCollections.createdAt)
        : sortOrder === 'desc'
          ? desc(sql`coalesce(${schema.comicCollections.sortName}, ${schema.comicCollections.name})`)
          : asc(sql`coalesce(${schema.comicCollections.sortName}, ${schema.comicCollections.name})`);

    const seriesCount = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.comicCollectionSeries)
      .where(eq(schema.comicCollectionSeries.collectionId, schema.comicCollections.id));

    const where = conditions.length ? and(...conditions) : undefined;
    const [items, [{ total }]] = await Promise.all([
      this.db
        .select({ collection: schema.comicCollections, seriesCount: sql<number>`(${seriesCount})` })
        .from(schema.comicCollections)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: sql<number>`count(*)` }).from(schema.comicCollections).where(where),
    ]);

    const firstCovers = new Map<string, string | null>();
    for (const { collection } of items) {
      const [first] = await this.db
        .select({
          seriesId: schema.comicSeries.id,
          coverUrl: schema.comicSeries.coverUrl,
          coverSource: schema.comicSeries.coverSource,
        })
        .from(schema.comicCollectionSeries)
        .innerJoin(schema.comicSeries, eq(schema.comicCollectionSeries.seriesId, schema.comicSeries.id))
        .where(eq(schema.comicCollectionSeries.collectionId, collection.id))
        .orderBy(asc(schema.comicCollectionSeries.position))
        .limit(1);
      firstCovers.set(
        collection.id,
        first
          ? this.coverService.getCoverUrl(first.seriesId, first.coverUrl, first.coverSource, 'comics/series')
          : null,
      );
    }

    return {
      collections: items.map(({ collection, seriesCount: count }) => ({
        id: collection.id,
        name: collection.name,
        seriesCount: Number(count),
        coverUrl: resolveCollectionCover(
          this.coverService.getCoverUrl(collection.id, collection.coverUrl, collection.coverSource, 'comics/collections'),
          firstCovers.get(collection.id) ?? null,
        ),
        createdAt: collection.createdAt,
      })),
      total: Number(total),
    };
  }

  async findOne(id: string, userId?: string) {
    const [collection] = await this.db
      .select()
      .from(schema.comicCollections)
      .where(eq(schema.comicCollections.id, id))
      .limit(1);
    if (!collection) throw new NotFoundException('Comic collection not found');

    const blacklist = userId
      ? notExists(
          this.db
            .select({ one: sql`1` })
            .from(schema.comicSeriesTags)
            .innerJoin(
              usersSchema.userBlacklistedTags,
              and(
                eq(schema.comicSeriesTags.tagId, usersSchema.userBlacklistedTags.tagId),
                eq(usersSchema.userBlacklistedTags.userId, userId),
              ),
            )
            .where(eq(schema.comicSeriesTags.seriesId, schema.comicSeries.id)),
        )
      : undefined;

    const bookCount = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.comicBooks)
      .where(and(eq(schema.comicBooks.seriesId, schema.comicSeries.id), ne(schema.comicBooks.status, 'hidden')));

    const memberRows = await this.db
      .select({ series: schema.comicSeries, bookCount: sql<number>`(${bookCount})` })
      .from(schema.comicCollectionSeries)
      .innerJoin(schema.comicSeries, eq(schema.comicCollectionSeries.seriesId, schema.comicSeries.id))
      .where(
        and(
          eq(schema.comicCollectionSeries.collectionId, id),
          ne(schema.comicSeries.status, 'hidden'),
          ...(blacklist ? [blacklist] : []),
        ),
      )
      .orderBy(asc(schema.comicCollectionSeries.position));

    const series = memberRows.map(({ series: s, bookCount: count }) => ({
      id: s.id,
      title: s.title,
      publisher: s.publisher,
      startYear: s.startYear,
      status: s.status,
      bookCount: Number(count),
      totalIssueCount: s.totalIssueCount,
      coverUrl: this.coverService.getCoverUrl(s.id, s.coverUrl, s.coverSource, 'comics/series'),
      createdAt: s.createdAt,
      comicvineLinked: false,
    }));

    return {
      id: collection.id,
      name: collection.name,
      sortName: collection.sortName,
      description: collection.description,
      coverUrl: resolveCollectionCover(
        this.coverService.getCoverUrl(collection.id, collection.coverUrl, collection.coverSource, 'comics/collections'),
        series[0]?.coverUrl ?? null,
      ),
      series,
    };
  }

  async create(input: { name: string; description?: string | null }) {
    const [row] = await this.db
      .insert(schema.comicCollections)
      .values({ name: input.name, description: input.description ?? null })
      .returning({ id: schema.comicCollections.id });
    this.appEvents.comicCollectionCreated(row.id);
    this.wsEvents.comicCollectionCreated(row.id);
    return { id: row.id };
  }

  async update(id: string, input: { name?: string; sortName?: string | null; description?: string | null }) {
    const [existing] = await this.db
      .select({ id: schema.comicCollections.id })
      .from(schema.comicCollections)
      .where(eq(schema.comicCollections.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Comic collection not found');
    await this.db.update(schema.comicCollections).set(input).where(eq(schema.comicCollections.id, id));
    this.appEvents.comicCollectionUpdated(id);
    this.wsEvents.comicCollectionUpdated(id);
    return { success: true };
  }

  async remove(id: string) {
    const [existing] = await this.db
      .select({ id: schema.comicCollections.id })
      .from(schema.comicCollections)
      .where(eq(schema.comicCollections.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Comic collection not found');
    await this.db.delete(schema.comicCollections).where(eq(schema.comicCollections.id, id));
    this.appEvents.comicCollectionDeleted(id);
    this.wsEvents.comicCollectionDeleted(id);
  }

  async addSeries(collectionId: string, seriesId: string) {
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${schema.comicCollectionSeries.position}), -1)` })
      .from(schema.comicCollectionSeries)
      .where(eq(schema.comicCollectionSeries.collectionId, collectionId));
    await this.db
      .insert(schema.comicCollectionSeries)
      .values({ collectionId, seriesId, position: Number(max) + 1 })
      .onConflictDoNothing();
    this.appEvents.comicCollectionUpdated(collectionId);
    this.wsEvents.comicCollectionUpdated(collectionId);
    this.wsEvents.comicSeriesUpdated(seriesId);
    return { success: true };
  }

  async removeSeries(collectionId: string, seriesId: string) {
    await this.db
      .delete(schema.comicCollectionSeries)
      .where(and(eq(schema.comicCollectionSeries.collectionId, collectionId), eq(schema.comicCollectionSeries.seriesId, seriesId)));
    this.appEvents.comicCollectionUpdated(collectionId);
    this.wsEvents.comicCollectionUpdated(collectionId);
    this.wsEvents.comicSeriesUpdated(seriesId);
    return { success: true };
  }

  async reorder(collectionId: string, seriesIds: string[]) {
    for (const { seriesId, position } of reorderPositions(seriesIds)) {
      await this.db
        .update(schema.comicCollectionSeries)
        .set({ position })
        .where(and(eq(schema.comicCollectionSeries.collectionId, collectionId), eq(schema.comicCollectionSeries.seriesId, seriesId)));
    }
    this.appEvents.comicCollectionUpdated(collectionId);
    this.wsEvents.comicCollectionUpdated(collectionId);
    return { success: true };
  }

  async findForSeries(seriesId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: schema.comicCollections.id, name: schema.comicCollections.name })
      .from(schema.comicCollectionSeries)
      .innerJoin(schema.comicCollections, eq(schema.comicCollectionSeries.collectionId, schema.comicCollections.id))
      .where(eq(schema.comicCollectionSeries.seriesId, seriesId))
      .orderBy(asc(schema.comicCollections.name));
  }
}
