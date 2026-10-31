import { randomUUID } from 'node:crypto';
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
  isNotNull,
  isNull,
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
import * as comicvineSchema from '../comicvine/schema';
import { CoverService } from '../common/cover.service';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import {
  normalizeIssueNumber,
  orderProblem,
  placeItems,
  type MissingItem,
  type ReadingListEntryInput,
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
    typeof ebookProgressSchema &
    typeof comicvineSchema
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

/** An entry's key (see entryKey): its item id, or its own id while missing. */
const ENTRY_KEY = sql<string>`coalesce(${entries.comicBookId}, ${entries.audiobookId}, ${entries.ebookId}, ${entries.id})`;

const ITEM_NAMES: Record<ReadingListMediaType, string> = {
  comic: 'Comic issues',
  audiobook: 'Audiobooks',
  ebook: 'Ebooks',
};

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
 *
 * An entry can name an item the library does not have yet. A missing comic
 * issue becomes the real one once the library has an issue linked to the same
 * ComicVine issue, or to the same ComicVine volume and number (fillMissing).
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
    if (list.mediaType === 'comic') await this.fillMissing(id);
    const [present, missing] = await Promise.all([
      this.loadEntries(list.mediaType, id, userId),
      this.missingEntries(id),
    ]);
    const shown = [...present, ...missing].sort(
      (a, b) => a.position - b.position,
    );
    return {
      id: list.id,
      mediaType: list.mediaType,
      name: list.name,
      sortName: list.sortName,
      description: list.description,
      coverUrl: present[0]?.coverUrl ?? null,
      entries: shown,
      finishedCount: shown.filter((e) => e.readStatus === 'finished').length,
      missingCount: missing.length,
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
      .select()
      .from(entries)
      .where(eq(entries.readingListId, id))
      .orderBy(asc(entries.position), asc(entries.id));
    return rows.map((r) => {
      const itemId = r.comicBookId ?? r.audiobookId ?? r.ebookId;
      return itemId
        ? { itemId, note: r.note }
        : {
            itemId: null,
            note: r.note,
            missing: {
              entryId: r.id,
              title: r.missingTitle!,
              comicvineIssueId: r.comicvineIssueId,
              comicvineVolumeId: r.comicvineVolumeId,
              number: r.issueNumber,
            },
          };
    });
  }

  /** addEntries for items in the library only. */
  addItems(
    id: string,
    itemIds: string[],
    options: { position?: number; note?: string | null } = {},
  ): Promise<ReadingListAddResultDto> {
    return this.addEntries(
      id,
      itemIds.map((itemId) => ({ itemId })),
      options,
    );
  }

  /**
   * Adds entries before `position` (0-based; default at the end), in the
   * order given. Items already in the list stay where they are, and so do
   * missing items it already names.
   */
  async addEntries(
    id: string,
    inputs: ReadingListEntryInput[],
    options: { position?: number; note?: string | null } = {},
  ): Promise<ReadingListAddResultDto> {
    const list = await this.getList(id);
    const itemIds = [
      ...new Set(inputs.flatMap((i) => ('itemId' in i ? [i.itemId] : []))),
    ];
    await this.requireItems(list.mediaType, itemIds);
    const wanted = inputs.flatMap((i) =>
      'missing' in i ? [checkMissing(list.mediaType, i.missing)] : [],
    );
    // A missing issue the library now has becomes the real one first, so
    // adding that issue finds it in place.
    if (list.mediaType === 'comic') await this.fillMissing(id);

    const states = await this.entryStates(id);
    const stored = await this.storedPositions(id);
    const missingNow = states.flatMap((s) => (s.missing ? [s.missing] : []));
    const newMissing = new Map<string, MissingItem>();
    const keys: string[] = [];
    let alreadyIn = 0;
    for (const input of inputs) {
      if ('itemId' in input) {
        if (stored.has(input.itemId) || keys.includes(input.itemId)) {
          alreadyIn++;
        } else {
          keys.push(input.itemId);
        }
        continue;
      }
      const item = wanted.shift()!;
      if (
        [...missingNow, ...newMissing.values()].some((m) =>
          sameMissing(m, item),
        )
      ) {
        alreadyIn++;
        continue;
      }
      const key = randomUUID();
      newMissing.set(key, item);
      keys.push(key);
    }

    const order = placeItems([...stored.keys()], keys, options.position);
    const note = options.note?.trim() || null;

    await this.db.transaction(async (tx) => {
      if (keys.length > 0) {
        await tx.insert(entries).values(
          keys.map((key) => {
            const missing = newMissing.get(key);
            return {
              readingListId: id,
              position: order.indexOf(key),
              note,
              ...(missing
                ? { id: key, ...missingValues(missing) }
                : itemValues(list.mediaType, key)),
            };
          }),
        );
      }
      await this.writePositions(tx, id, stored, order);
    });

    return { added: keys.length, alreadyIn, entryCount: order.length };
  }

  /**
   * Removes entries, named by item id or, for missing items, entry id.
   * Returns how many were in the list.
   */
  async removeItems(id: string, keys: string[]): Promise<number> {
    await this.getList(id);
    const stored = await this.storedPositions(id);
    const removing = new Set(keys.filter((k) => stored.has(k)));
    if (removing.size === 0) return 0;
    const order = [...stored.keys()].filter((key) => !removing.has(key));

    await this.db.transaction(async (tx) => {
      await tx
        .delete(entries)
        .where(
          and(eq(entries.readingListId, id), inArray(ENTRY_KEY, [...removing])),
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
    await this.getList(id);
    const updated = await this.db
      .update(entries)
      .set({ note: note?.trim() || null })
      .where(and(eq(entries.readingListId, id), eq(ENTRY_KEY, itemId)))
      .returning({ id: entries.id });
    if (updated.length === 0) {
      throw new NotFoundException('Not in this reading list');
    }
    await this.touch(this.db, id);
    return { success: true };
  }

  /**
   * Makes the list hold exactly these entries, in this order, with these
   * notes. Items that no longer exist are left out; missing items keep their
   * entry ids. Used by undo.
   */
  async setEntries(id: string, wanted: ReadingListEntryState[]): Promise<void> {
    const list = await this.getList(id);
    const gone = new Set(
      await this.missingItems(
        list.mediaType,
        wanted.flatMap((w) => (w.itemId ? [w.itemId] : [])),
      ),
    );
    const kept = wanted.filter((w) => !w.itemId || !gone.has(w.itemId));
    await this.db.transaction(async (tx) => {
      await tx.delete(entries).where(eq(entries.readingListId, id));
      if (kept.length > 0) {
        await tx.insert(entries).values(
          kept.map((w, position) => ({
            readingListId: id,
            position,
            note: w.note,
            ...(w.itemId
              ? itemValues(list.mediaType, w.itemId)
              : { id: w.missing!.entryId, ...missingValues(w.missing!) }),
          })),
        );
      }
      await this.touch(tx, id);
    });
  }

  /**
   * Turns missing comic issues the library now has into the real issues: by
   * ComicVine issue, or by ComicVine volume and number. A missing issue whose
   * match is already in the list is dropped. Returns how many changed.
   */
  async fillMissing(id: string): Promise<number> {
    const waiting = await this.db
      .select({
        id: entries.id,
        comicvineIssueId: entries.comicvineIssueId,
        comicvineVolumeId: entries.comicvineVolumeId,
        number: entries.issueNumber,
      })
      .from(entries)
      .where(
        and(
          eq(entries.readingListId, id),
          isNotNull(entries.missingTitle),
          or(
            isNotNull(entries.comicvineIssueId),
            and(
              isNotNull(entries.comicvineVolumeId),
              isNotNull(entries.issueNumber),
            ),
          ),
        ),
      );
    if (waiting.length === 0) return 0;

    const matches = await this.findComicMatches(waiting);
    if (matches.size === 0) return 0;
    const inList = new Set(
      (
        await this.db
          .select({ id: entries.comicBookId })
          .from(entries)
          .where(
            and(eq(entries.readingListId, id), isNotNull(entries.comicBookId)),
          )
      ).map((r) => r.id),
    );

    await this.db.transaction(async (tx) => {
      for (const [entryId, bookId] of matches) {
        if (inList.has(bookId)) {
          await tx.delete(entries).where(eq(entries.id, entryId));
        } else {
          inList.add(bookId);
          await tx
            .update(entries)
            .set({
              comicBookId: bookId,
              missingTitle: null,
              comicvineIssueId: null,
              comicvineVolumeId: null,
              issueNumber: null,
            })
            .where(eq(entries.id, entryId));
        }
      }
    });
    if (matches.size > 0) {
      // Deleting duplicates leaves gaps; close them.
      const stored = await this.storedPositions(id);
      await this.writePositions(this.db, id, stored, [...stored.keys()]);
    }
    return matches.size;
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

  /** Each entry's stored position by key, in list order. */
  private async storedPositions(id: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ key: ENTRY_KEY, position: entries.position })
      .from(entries)
      .where(eq(entries.readingListId, id))
      .orderBy(asc(entries.position), asc(entries.id));
    return new Map(rows.map((r) => [r.key, r.position]));
  }

  /** For each waiting entry id, a library issue that matches it. */
  private async findComicMatches(
    waiting: {
      id: string;
      comicvineIssueId: number | null;
      comicvineVolumeId: number | null;
      number: string | null;
    }[],
  ): Promise<Map<string, string>> {
    const c = comicsSchema;
    const cv = comicvineSchema;
    const issueIds = waiting.flatMap((w) =>
      w.comicvineIssueId ? [w.comicvineIssueId] : [],
    );
    const volumeIds = waiting.flatMap((w) =>
      w.comicvineVolumeId && w.number ? [w.comicvineVolumeId] : [],
    );
    // Single issues before collected editions, then the oldest import.
    const preference = [
      sql`(${c.comicBooks.format} = 'single_issue') DESC`,
      asc(c.comicBooks.createdAt),
    ];

    const [byIssue, byVolume] = await Promise.all([
      issueIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              comicvineIssueId: cv.comicvineIssues.comicvineIssueId,
              bookId: c.comicBooks.id,
            })
            .from(cv.comicvineIssueLinks)
            .innerJoin(
              cv.comicvineIssues,
              eq(
                cv.comicvineIssueLinks.comicvineIssueRowId,
                cv.comicvineIssues.id,
              ),
            )
            .innerJoin(
              c.comicBooks,
              eq(cv.comicvineIssueLinks.bookId, c.comicBooks.id),
            )
            .where(
              and(
                inArray(cv.comicvineIssues.comicvineIssueId, issueIds),
                ne(c.comicBooks.status, 'hidden'),
              ),
            )
            .orderBy(...preference),
      volumeIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              comicvineVolumeId: cv.comicvineVolumes.comicvineVolumeId,
              number: sql<
                string | null
              >`coalesce(${c.comicBooks.number}, ${cv.comicvineIssues.issueNumber})`,
              bookId: c.comicBooks.id,
            })
            .from(cv.comicvineVolumeLinks)
            .innerJoin(
              cv.comicvineVolumes,
              eq(
                cv.comicvineVolumeLinks.comicvineVolumeRowId,
                cv.comicvineVolumes.id,
              ),
            )
            .innerJoin(
              c.comicBooks,
              eq(c.comicBooks.seriesId, cv.comicvineVolumeLinks.seriesId),
            )
            .leftJoin(
              cv.comicvineIssueLinks,
              eq(cv.comicvineIssueLinks.bookId, c.comicBooks.id),
            )
            .leftJoin(
              cv.comicvineIssues,
              eq(
                cv.comicvineIssueLinks.comicvineIssueRowId,
                cv.comicvineIssues.id,
              ),
            )
            .where(
              and(
                inArray(cv.comicvineVolumes.comicvineVolumeId, volumeIds),
                ne(c.comicBooks.status, 'hidden'),
              ),
            )
            .orderBy(...preference),
    ]);

    const issueBook = new Map<number, string>();
    for (const row of byIssue) {
      if (!issueBook.has(row.comicvineIssueId)) {
        issueBook.set(row.comicvineIssueId, row.bookId);
      }
    }
    const volumeBook = new Map<string, string>();
    for (const row of byVolume) {
      if (!row.number) continue;
      const key = `${row.comicvineVolumeId}#${normalizeIssueNumber(row.number)}`;
      if (!volumeBook.has(key)) volumeBook.set(key, row.bookId);
    }

    const matches = new Map<string, string>();
    for (const w of waiting) {
      const bookId =
        (w.comicvineIssueId && issueBook.get(w.comicvineIssueId)) ||
        (w.comicvineVolumeId && w.number
          ? volumeBook.get(
              `${w.comicvineVolumeId}#${normalizeIssueNumber(w.number)}`,
            )
          : undefined);
      if (bookId) matches.set(w.id, bookId);
    }
    return matches;
  }

  /** Missing entries in display form. */
  private async missingEntries(id: string): Promise<ReadingListEntryDto[]> {
    const rows = await this.db
      .select()
      .from(entries)
      .where(
        and(eq(entries.readingListId, id), isNotNull(entries.missingTitle)),
      );
    return rows.map((r) => ({
      id: r.id,
      itemId: null,
      missing: true,
      position: r.position,
      note: r.note,
      title: r.missingTitle!,
      subtitle: null,
      coverUrl: null,
      seriesId: null,
      seriesTitle: null,
      number: r.issueNumber,
      readStatus: 'unread' as const,
    }));
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
          AND ${ENTRY_KEY} = v.item_id`);
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
      .where(
        and(eq(entries.readingListId, listId), isNull(entries.missingTitle)),
      )
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
        id: r.itemId,
        itemId: r.itemId,
        missing: false,
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
    id: row.itemId,
    itemId: row.itemId,
    missing: false,
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

/** A missing item as given, trimmed; ComicVine ids only on comic lists. */
function checkMissing(
  mediaType: ReadingListMediaType,
  item: MissingItem,
): MissingItem {
  const title = item.title.trim();
  if (!title) throw new BadRequestException('A missing item needs a title');
  const hasComicvine = item.comicvineIssueId || item.comicvineVolumeId;
  if (hasComicvine && mediaType !== 'comic') {
    throw new BadRequestException('ComicVine ids are for comic reading lists');
  }
  return {
    title,
    comicvineIssueId: item.comicvineIssueId ?? null,
    comicvineVolumeId: item.comicvineVolumeId ?? null,
    number: item.number?.trim() || null,
  };
}

function missingValues(item: MissingItem) {
  return {
    missingTitle: item.title,
    comicvineIssueId: item.comicvineIssueId ?? null,
    comicvineVolumeId: item.comicvineVolumeId ?? null,
    issueNumber: item.number ?? null,
  };
}

/** Whether two missing items name the same issue or book. */
function sameMissing(a: MissingItem, b: MissingItem): boolean {
  if (a.comicvineIssueId && b.comicvineIssueId) {
    return a.comicvineIssueId === b.comicvineIssueId;
  }
  if (a.comicvineVolumeId && b.comicvineVolumeId && a.number && b.number) {
    return (
      a.comicvineVolumeId === b.comicvineVolumeId &&
      normalizeIssueNumber(a.number) === normalizeIssueNumber(b.number)
    );
  }
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
}
