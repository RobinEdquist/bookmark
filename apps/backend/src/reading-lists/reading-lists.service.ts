import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  ne,
  notExists,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as comicsSchema from '../comics/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as usersSchema from '../users/schema';
import * as comicProgressSchema from '../comic-progress/schema';
import * as progressSchema from '../progress/schema';
import * as ebookProgressSchema from '../ebook-progress/schema';
import { CoverService } from '../common/cover.service';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import {
  orderProblem,
  placeItems,
  type ReadingListEntryState,
  type ReadingListMediaType,
} from './reading-list-order';
import {
  ReadingListAddResultDto,
  ReadingListDetailDto,
  ReadingListEntryDto,
  ReadingListIdResponseDto,
  ReadingListListResponseDto,
  ReadingListSuccessResponseDto,
  type ReadStatus,
} from './dto/reading-list-response.dto';

type Db = NodePgDatabase<
  typeof schema &
    typeof comicsSchema &
    typeof audiobooksSchema &
    typeof ebooksSchema &
    typeof usersSchema &
    typeof comicProgressSchema &
    typeof progressSchema &
    typeof ebookProgressSchema
>;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface ListFilters {
  mediaType?: ReadingListMediaType;
  search?: string;
  /** Only lists that hold this item. */
  itemId?: string;
  sortBy?: 'name' | 'recentlyUpdated';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const entries = schema.readingListEntries;

const ITEM_NAMES: Record<ReadingListMediaType, string> = {
  comic: 'Comic issues',
  audiobook: 'Audiobooks',
  ebook: 'Ebooks',
};

function itemColumn(mediaType: ReadingListMediaType) {
  switch (mediaType) {
    case 'comic':
      return entries.comicBookId;
    case 'audiobook':
      return entries.audiobookId;
    case 'ebook':
      return entries.ebookId;
  }
}

function itemValues(mediaType: ReadingListMediaType, itemId: string) {
  return {
    comicBookId: mediaType === 'comic' ? itemId : null,
    audiobookId: mediaType === 'audiobook' ? itemId : null,
    ebookId: mediaType === 'ebook' ? itemId : null,
  };
}

/**
 * Reading lists: ordered items across series, shared across the library.
 * One list holds one media type. Every structural change rewrites positions
 * so they run 0..n-1 in list order.
 */
@Injectable()
export class ReadingListsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Db,
    private readonly coverService: CoverService,
    private readonly metadataResolver: MetadataResolverService,
  ) {}

  async findAll(
    filters: ListFilters = {},
  ): Promise<ReadingListListResponseDto> {
    const {
      mediaType,
      search,
      itemId,
      sortBy = 'name',
      sortOrder = sortBy === 'name' ? 'asc' : 'desc',
      limit = 50,
      offset = 0,
    } = filters;
    const lists = schema.readingLists;

    const conditions: SQL[] = [];
    if (mediaType) conditions.push(eq(lists.mediaType, mediaType));
    if (search) conditions.push(ilike(lists.name, `%${search}%`));
    if (itemId) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(entries)
            .where(
              and(
                eq(entries.readingListId, lists.id),
                or(
                  eq(entries.comicBookId, itemId),
                  eq(entries.audiobookId, itemId),
                  eq(entries.ebookId, itemId),
                ),
              ),
            ),
        ),
      );
    }

    const sortKey = sql`coalesce(${lists.sortName}, ${lists.name})`;
    const orderBy =
      sortBy === 'recentlyUpdated'
        ? sortOrder === 'asc'
          ? asc(lists.updatedAt)
          : desc(lists.updatedAt)
        : sortOrder === 'desc'
          ? desc(sortKey)
          : asc(sortKey);

    const entryCount = this.db
      .select({ value: sql<number>`count(*)` })
      .from(entries)
      .where(eq(entries.readingListId, lists.id));

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ list: lists, entryCount: sql<number>`(${entryCount})` })
        .from(lists)
        .where(where)
        .orderBy(orderBy, asc(lists.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(lists)
        .where(where),
    ]);

    const covers = await Promise.all(
      rows.map(({ list }) => this.firstCover(list.id)),
    );

    return {
      readingLists: rows.map(({ list, entryCount: count }, i) => ({
        id: list.id,
        mediaType: list.mediaType,
        name: list.name,
        description: list.description,
        entryCount: Number(count),
        coverUrl: covers[i],
        updatedAt: list.updatedAt,
      })),
      total: Number(total),
    };
  }

  /** The list with its entries in order, as `userId` may see them. */
  async findOne(id: string, userId: string): Promise<ReadingListDetailDto> {
    const list = await this.getList(id);
    const shown = await this.loadEntries(list.mediaType, id, userId);
    return {
      id: list.id,
      mediaType: list.mediaType,
      name: list.name,
      sortName: list.sortName,
      description: list.description,
      coverUrl: shown[0]?.coverUrl ?? null,
      entries: shown,
      finishedCount: shown.filter((e) => e.readStatus === 'finished').length,
    };
  }

  async create(
    input: {
      mediaType: ReadingListMediaType;
      name: string;
      sortName?: string | null;
      description?: string | null;
    },
    userId: string | null,
  ): Promise<ReadingListIdResponseDto> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name cannot be empty');
    const [row] = await this.db
      .insert(schema.readingLists)
      .values({
        mediaType: input.mediaType,
        name,
        sortName: input.sortName || null,
        description: input.description || null,
        createdBy: userId,
      })
      .returning({ id: schema.readingLists.id });
    return { id: row.id };
  }

  async update(
    id: string,
    input: {
      name?: string;
      sortName?: string | null;
      description?: string | null;
    },
  ): Promise<ReadingListSuccessResponseDto> {
    await this.getList(id);
    const fields = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as typeof input;
    if (fields.name !== undefined) {
      fields.name = fields.name.trim();
      if (!fields.name) throw new BadRequestException('name cannot be empty');
    }
    if (Object.keys(fields).length === 0) return { success: true };
    await this.db
      .update(schema.readingLists)
      .set(fields)
      .where(eq(schema.readingLists.id, id));
    return { success: true };
  }

  async remove(id: string): Promise<void> {
    await this.getList(id);
    await this.db
      .delete(schema.readingLists)
      .where(eq(schema.readingLists.id, id));
  }

  /** Every entry in order, hidden and blacklisted items included. */
  async entryStates(id: string): Promise<ReadingListEntryState[]> {
    const rows = await this.db
      .select({
        comicBookId: entries.comicBookId,
        audiobookId: entries.audiobookId,
        ebookId: entries.ebookId,
        note: entries.note,
      })
      .from(entries)
      .where(eq(entries.readingListId, id))
      .orderBy(asc(entries.position), asc(entries.id));
    return rows.map((r) => ({
      itemId: (r.comicBookId ?? r.audiobookId ?? r.ebookId)!,
      note: r.note,
    }));
  }

  /**
   * Adds items before `position` (0-based; default at the end), in the order
   * given. Items already in the list stay where they are.
   */
  async addItems(
    id: string,
    itemIds: string[],
    options: { position?: number; note?: string | null } = {},
  ): Promise<ReadingListAddResultDto> {
    const list = await this.getList(id);
    const ids = [...new Set(itemIds)];
    await this.requireItems(list.mediaType, ids);

    const stored = await this.storedPositions(id);
    const current = [...stored.keys()];
    const order = placeItems(current, ids, options.position);
    const fresh = order.filter((itemId) => !stored.has(itemId));
    const note = options.note?.trim() || null;

    await this.db.transaction(async (tx) => {
      if (fresh.length > 0) {
        await tx.insert(entries).values(
          fresh.map((itemId) => ({
            readingListId: id,
            position: order.indexOf(itemId),
            note,
            ...itemValues(list.mediaType, itemId),
          })),
        );
      }
      await this.writePositions(tx, id, stored, order);
    });

    return {
      added: fresh.length,
      alreadyIn: ids.length - fresh.length,
      entryCount: order.length,
    };
  }

  /** Removes items from the list. Returns how many were in it. */
  async removeItems(id: string, itemIds: string[]): Promise<number> {
    const list = await this.getList(id);
    const stored = await this.storedPositions(id);
    const removing = new Set(itemIds.filter((i) => stored.has(i)));
    if (removing.size === 0) return 0;
    const order = [...stored.keys()].filter((itemId) => !removing.has(itemId));

    await this.db.transaction(async (tx) => {
      await tx
        .delete(entries)
        .where(
          and(
            eq(entries.readingListId, id),
            inArray(itemColumn(list.mediaType), [...removing]),
          ),
        );
      await this.writePositions(tx, id, stored, order);
    });
    return removing.size;
  }

  /** Sets the order. `itemIds` must hold every item in the list once. */
  async reorder(
    id: string,
    itemIds: string[],
  ): Promise<ReadingListSuccessResponseDto> {
    await this.getList(id);
    const stored = await this.storedPositions(id);
    const problem = orderProblem([...stored.keys()], itemIds);
    if (problem) throw new BadRequestException(problem);
    await this.db.transaction((tx) =>
      this.writePositions(tx, id, stored, itemIds),
    );
    return { success: true };
  }

  /** Moves one item to a 0-based place; past the end means last. */
  async moveItem(
    id: string,
    itemId: string,
    position: number,
  ): Promise<ReadingListSuccessResponseDto> {
    await this.getList(id);
    const stored = await this.storedPositions(id);
    if (!stored.has(itemId)) {
      throw new NotFoundException('Not in this reading list');
    }
    const order = placeItems(
      [...stored.keys()].filter((i) => i !== itemId),
      [itemId],
      position,
    );
    await this.db.transaction((tx) =>
      this.writePositions(tx, id, stored, order),
    );
    return { success: true };
  }

  async setNote(
    id: string,
    itemId: string,
    note: string | null,
  ): Promise<ReadingListSuccessResponseDto> {
    const list = await this.getList(id);
    const updated = await this.db
      .update(entries)
      .set({ note: note?.trim() || null })
      .where(
        and(
          eq(entries.readingListId, id),
          eq(itemColumn(list.mediaType), itemId),
        ),
      )
      .returning({ id: entries.id });
    if (updated.length === 0) {
      throw new NotFoundException('Not in this reading list');
    }
    await this.touch(this.db, id);
    return { success: true };
  }

  /**
   * Makes the list hold exactly these entries, in this order, with these
   * notes. Items that no longer exist are left out. Used by undo.
   */
  async setEntries(id: string, wanted: ReadingListEntryState[]): Promise<void> {
    const list = await this.getList(id);
    const missing = new Set(
      await this.missingItems(
        list.mediaType,
        wanted.map((w) => w.itemId),
      ),
    );
    const kept = wanted.filter((w) => !missing.has(w.itemId));
    await this.db.transaction(async (tx) => {
      await tx.delete(entries).where(eq(entries.readingListId, id));
      if (kept.length > 0) {
        await tx.insert(entries).values(
          kept.map((w, position) => ({
            readingListId: id,
            position,
            note: w.note,
            ...itemValues(list.mediaType, w.itemId),
          })),
        );
      }
      await this.touch(tx, id);
    });
  }

  /** The list's media type, or NotFound. */
  async mediaTypeOf(id: string): Promise<ReadingListMediaType> {
    return (await this.getList(id)).mediaType;
  }

  /** The ids among `ids` that are not items of this media type. */
  async missingItems(
    mediaType: ReadingListMediaType,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const table =
      mediaType === 'comic'
        ? comicsSchema.comicBooks
        : mediaType === 'audiobook'
          ? audiobooksSchema.audiobooks
          : ebooksSchema.ebooks;
    const rows = await this.db
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.id, ids));
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((itemId) => !found.has(itemId));
  }

  // ===== helpers =====

  private async getList(id: string) {
    const [list] = await this.db
      .select()
      .from(schema.readingLists)
      .where(eq(schema.readingLists.id, id))
      .limit(1);
    if (!list) throw new NotFoundException('Reading list not found');
    return list;
  }

  private async requireItems(
    mediaType: ReadingListMediaType,
    ids: string[],
  ): Promise<void> {
    const missing = await this.missingItems(mediaType, ids);
    if (missing.length === 0) return;
    throw new BadRequestException(
      `${ITEM_NAMES[mediaType]} not found: ${missing.join(', ')}.` +
        (mediaType === 'comic' ? ' Give issue ids, not series ids.' : ''),
    );
  }

  /** Each item's stored position, in list order. */
  private async storedPositions(id: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        comicBookId: entries.comicBookId,
        audiobookId: entries.audiobookId,
        ebookId: entries.ebookId,
        position: entries.position,
      })
      .from(entries)
      .where(eq(entries.readingListId, id))
      .orderBy(asc(entries.position), asc(entries.id));
    return new Map(
      rows.map((r) => [
        (r.comicBookId ?? r.audiobookId ?? r.ebookId)!,
        r.position,
      ]),
    );
  }

  /**
   * Stores each item's index in `order` as its position, writing only the
   * rows whose stored position differs. Items not in `stored` were just
   * inserted at their place.
   */
  private async writePositions(
    tx: Tx | Db,
    id: string,
    stored: Map<string, number>,
    order: string[],
  ): Promise<void> {
    const moved = order
      .map((itemId, position) => ({ itemId, position }))
      .filter(({ itemId, position }) => {
        const was = stored.get(itemId);
        return was !== undefined && was !== position;
      });
    if (moved.length > 0) {
      const values = sql.join(
        moved.map(
          ({ itemId, position }) => sql`(${itemId}::uuid, ${position}::int)`,
        ),
        sql`, `,
      );
      await tx.execute(sql`
        UPDATE ${entries} SET position = v.position
        FROM (VALUES ${values}) AS v(item_id, position)
        WHERE ${entries.readingListId} = ${id}
          AND coalesce(${entries.comicBookId}, ${entries.audiobookId}, ${entries.ebookId}) = v.item_id`);
    }
    await this.touch(tx, id);
  }

  private async touch(tx: Tx | Db, id: string): Promise<void> {
    await tx
      .update(schema.readingLists)
      .set({ updatedAt: new Date() })
      .where(eq(schema.readingLists.id, id));
  }

  private async firstCover(listId: string): Promise<string | null> {
    const [first] = await this.db
      .select({
        comicBookId: entries.comicBookId,
        audiobookId: entries.audiobookId,
        ebookId: entries.ebookId,
      })
      .from(entries)
      .where(eq(entries.readingListId, listId))
      .orderBy(asc(entries.position))
      .limit(1);
    if (!first) return null;

    const lookup = first.comicBookId
      ? { table: comicsSchema.comicBooks, id: first.comicBookId }
      : first.audiobookId
        ? { table: audiobooksSchema.audiobooks, id: first.audiobookId }
        : { table: ebooksSchema.ebooks, id: first.ebookId! };
    const [item] = await this.db
      .select({
        coverUrl: lookup.table.coverUrl,
        coverSource: lookup.table.coverSource,
      })
      .from(lookup.table)
      .where(eq(lookup.table.id, lookup.id))
      .limit(1);
    if (!item) return null;
    const apiPath = first.comicBookId
      ? 'comics/books'
      : first.audiobookId
        ? 'audiobooks'
        : 'ebooks';
    return this.coverService.getCoverUrl(
      lookup.id,
      item.coverUrl,
      item.coverSource,
      apiPath,
    );
  }

  private loadEntries(
    mediaType: ReadingListMediaType,
    id: string,
    userId: string,
  ): Promise<ReadingListEntryDto[]> {
    switch (mediaType) {
      case 'comic':
        return this.comicEntries(id, userId);
      case 'audiobook':
        return this.audiobookEntries(id, userId);
      case 'ebook':
        return this.ebookEntries(id, userId);
    }
  }

  private async comicEntries(
    id: string,
    userId: string,
  ): Promise<ReadingListEntryDto[]> {
    const c = comicsSchema;
    const rows = await this.db
      .select({
        itemId: c.comicBooks.id,
        position: entries.position,
        note: entries.note,
        title: c.comicBooks.title,
        number: c.comicBooks.number,
        coverUrl: c.comicBooks.coverUrl,
        coverSource: c.comicBooks.coverSource,
        seriesId: c.comicSeries.id,
        seriesTitle: c.comicSeries.title,
      })
      .from(entries)
      .innerJoin(c.comicBooks, eq(entries.comicBookId, c.comicBooks.id))
      .innerJoin(c.comicSeries, eq(c.comicBooks.seriesId, c.comicSeries.id))
      .where(
        and(
          eq(entries.readingListId, id),
          ne(c.comicBooks.status, 'hidden'),
          ne(c.comicSeries.status, 'hidden'),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(c.comicSeriesTags)
              .innerJoin(
                usersSchema.userBlacklistedTags,
                and(
                  eq(
                    c.comicSeriesTags.tagId,
                    usersSchema.userBlacklistedTags.tagId,
                  ),
                  eq(usersSchema.userBlacklistedTags.userId, userId),
                ),
              )
              .where(eq(c.comicSeriesTags.seriesId, c.comicSeries.id)),
          ),
        ),
      )
      .orderBy(asc(entries.position));

    const ids = rows.map((r) => r.itemId);
    const [books, series, statuses] = await Promise.all([
      this.metadataResolver.forComicBooks(ids),
      this.metadataResolver.forComicSeries(rows.map((r) => r.seriesId)),
      this.comicReadStatuses(userId, ids),
    ]);

    return rows.map((r) => {
      const seriesTitle = series.get(r.seriesId)?.title ?? r.seriesTitle;
      const book = books.get(r.itemId);
      const number = book ? book.number : r.number;
      const issueTitle = book ? book.title : r.title;
      return {
        itemId: r.itemId,
        position: r.position,
        note: r.note,
        title: number ? `${seriesTitle} #${number}` : seriesTitle,
        subtitle: issueTitle || null,
        coverUrl: this.coverService.getCoverUrl(
          r.itemId,
          r.coverUrl,
          r.coverSource,
          'comics/books',
        ),
        seriesId: r.seriesId,
        seriesTitle,
        number: number ?? null,
        readStatus: statuses.get(r.itemId) ?? 'unread',
      };
    });
  }

  private async comicReadStatuses(
    userId: string,
    bookIds: string[],
  ): Promise<Map<string, ReadStatus>> {
    if (bookIds.length === 0) return new Map();
    const progress = comicProgressSchema.comicBookProgress;
    const rows = await this.db
      .select({ itemId: progress.comicBookId, status: progress.status })
      .from(progress)
      .where(
        and(
          eq(progress.userId, userId),
          inArray(progress.comicBookId, bookIds),
        ),
      );
    return new Map(rows.map((r) => [r.itemId, r.status]));
  }

  private async audiobookEntries(
    id: string,
    userId: string,
  ): Promise<ReadingListEntryDto[]> {
    const a = audiobooksSchema;
    const p = progressSchema.userAudiobookProgress;
    const rows = await this.db
      .select({
        itemId: a.audiobooks.id,
        position: entries.position,
        note: entries.note,
        title: a.audiobooks.title,
        coverUrl: a.audiobooks.coverUrl,
        coverSource: a.audiobooks.coverSource,
        completed: p.completed,
        currentPosition: p.currentPosition,
      })
      .from(entries)
      .innerJoin(a.audiobooks, eq(entries.audiobookId, a.audiobooks.id))
      .leftJoin(
        p,
        and(eq(p.audiobookId, a.audiobooks.id), eq(p.userId, userId)),
      )
      .where(
        and(
          eq(entries.readingListId, id),
          ne(a.audiobooks.status, 'hidden'),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(a.audiobookTags)
              .innerJoin(
                usersSchema.userBlacklistedTags,
                and(
                  eq(
                    a.audiobookTags.tagId,
                    usersSchema.userBlacklistedTags.tagId,
                  ),
                  eq(usersSchema.userBlacklistedTags.userId, userId),
                ),
              )
              .where(eq(a.audiobookTags.audiobookId, a.audiobooks.id)),
          ),
        ),
      )
      .orderBy(asc(entries.position));

    const resolved = await this.metadataResolver.forAudiobooks(
      rows.map((r) => r.itemId),
    );
    return rows.map((r) =>
      bookEntry(
        r,
        resolved.get(r.itemId),
        this.coverService.getCoverUrl(
          r.itemId,
          r.coverUrl,
          r.coverSource,
          'audiobooks',
        ),
        r.completed
          ? 'finished'
          : (r.currentPosition ?? 0) > 0
            ? 'in_progress'
            : 'unread',
      ),
    );
  }

  private async ebookEntries(
    id: string,
    userId: string,
  ): Promise<ReadingListEntryDto[]> {
    const eb = ebooksSchema;
    const p = ebookProgressSchema.userEbookProgress;
    const rows = await this.db
      .select({
        itemId: eb.ebooks.id,
        position: entries.position,
        note: entries.note,
        title: eb.ebooks.title,
        coverUrl: eb.ebooks.coverUrl,
        coverSource: eb.ebooks.coverSource,
        completed: p.completed,
        progressPercent: p.progressPercent,
      })
      .from(entries)
      .innerJoin(eb.ebooks, eq(entries.ebookId, eb.ebooks.id))
      .leftJoin(p, and(eq(p.ebookId, eb.ebooks.id), eq(p.userId, userId)))
      .where(
        and(
          eq(entries.readingListId, id),
          ne(eb.ebooks.status, 'hidden'),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(eb.ebookTags)
              .innerJoin(
                usersSchema.userBlacklistedTags,
                and(
                  eq(eb.ebookTags.tagId, usersSchema.userBlacklistedTags.tagId),
                  eq(usersSchema.userBlacklistedTags.userId, userId),
                ),
              )
              .where(eq(eb.ebookTags.ebookId, eb.ebooks.id)),
          ),
        ),
      )
      .orderBy(asc(entries.position));

    const resolved = await this.metadataResolver.forEbooks(
      rows.map((r) => r.itemId),
    );
    return rows.map((r) =>
      bookEntry(
        r,
        resolved.get(r.itemId),
        this.coverService.getCoverUrl(
          r.itemId,
          r.coverUrl,
          r.coverSource,
          'ebooks',
        ),
        r.completed
          ? 'finished'
          : (r.progressPercent ?? 0) > 0
            ? 'in_progress'
            : 'unread',
      ),
    );
  }
}

function bookEntry(
  row: { itemId: string; position: number; note: string | null; title: string },
  resolved: { title: string; authorNames: string[] } | undefined,
  coverUrl: string | null,
  readStatus: ReadStatus,
): ReadingListEntryDto {
  const authors = resolved?.authorNames ?? [];
  return {
    itemId: row.itemId,
    position: row.position,
    note: row.note,
    title: resolved?.title ?? row.title,
    subtitle: authors.length > 0 ? authors.join(', ') : null,
    coverUrl,
    seriesId: null,
    seriesTitle: null,
    number: null,
    readStatus,
  };
}
