import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AudiobooksService } from '../audiobooks/audiobooks.service';
import { EbooksService } from '../ebooks/ebooks.service';
import { ComicsService } from '../comics/comics.service';
import { ComicsCollectionsService } from '../comics/comics-collections.service';
import { ReadingListsService } from '../reading-lists/reading-lists.service';
import type { ReadingListEntryState } from '../reading-lists/reading-list-order';
import { SeriesService } from '../series/series.service';
import { loadMainCharacters } from '../comics/comic-main-characters';
import type { UpdateAudiobookDto } from '../audiobooks/dto/update-audiobook.dto';
import type { UpdateEbookDto } from '../ebooks/dto/update-ebook.dto';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import * as readingListsSchema from '../reading-lists/schema';
import {
  ENTITY_NAMES,
  FIELDS,
  type EntityType,
  type FieldState,
} from './mcp-fields';

type StoreDatabase = NodePgDatabase<
  typeof audiobooksSchema &
    typeof ebooksSchema &
    typeof comicsSchema &
    typeof readingListsSchema
>;

type ComicBookUpdate = Parameters<ComicsService['updateBook']>[1];
type ComicSeriesUpdate = Parameters<ComicsService['updateSeries']>[1];

/**
 * Reads and writes the fields in FIELDS for every entity the MCP edits.
 *
 * Reads return the stored value (not the resolved one: a ComicVine value
 * shown in place of an unlocked field is not stored here) and whether the
 * field is locked. Writes go through the domain services, so they lock the
 * field and fire the same events as a hand-edit in the web app.
 */
@Injectable()
export class McpEntityStore {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: StoreDatabase,
    private readonly comicsService: ComicsService,
    private readonly collectionsService: ComicsCollectionsService,
    private readonly readingListsService: ReadingListsService,
    private readonly audiobooksService: AudiobooksService,
    private readonly ebooksService: EbooksService,
    private readonly seriesService: SeriesService,
  ) {}

  /**
   * Refuses an id the user has blacklisted, as the read tools do. Book series,
   * collections and reading lists have no blacklist.
   */
  async verifyAccess(
    user: AuthenticatedUser,
    type: EntityType,
    id: string,
  ): Promise<void> {
    switch (type) {
      case 'comic_series':
        return this.comicsService.verifySeriesNotBlacklisted(id, user.id);
      case 'comic_issue':
        return this.comicsService.verifyBookNotBlacklisted(id, user.id);
      case 'audiobook':
        return this.audiobooksService.verifyNotBlacklisted(id, user.id);
      case 'ebook':
        return this.ebooksService.verifyNotBlacklisted(id, user.id);
      default:
        return;
    }
  }

  /**
   * Whether a comic id is a series or an issue, for tools that take either.
   * Ids are UUIDs, so one can only be the one or the other.
   */
  async comicEntity(id: string): Promise<'comic_series' | 'comic_issue'> {
    const [series] = await this.db
      .select({ id: comicsSchema.comicSeries.id })
      .from(comicsSchema.comicSeries)
      .where(eq(comicsSchema.comicSeries.id, id))
      .limit(1);
    if (series) return 'comic_series';
    const [book] = await this.db
      .select({ id: comicsSchema.comicBooks.id })
      .from(comicsSchema.comicBooks)
      .where(eq(comicsSchema.comicBooks.id, id))
      .limit(1);
    if (book) return 'comic_issue';
    throw new NotFoundException('No comic series or issue with that id');
  }

  /** The stored value and lock state of each named field. */
  async read(
    type: EntityType,
    id: string,
    fields: string[],
  ): Promise<Record<string, FieldState>> {
    const { row, manualFields } = await this.loadRow(type, id);
    const state: Record<string, FieldState> = {};
    for (const field of fields) {
      const spec = FIELDS[type][field];
      if (!spec) {
        throw new BadRequestException(`Unknown field: ${field}`);
      }
      const value =
        field in row ? row[field] : await this.readRelation(type, id, field);
      state[field] = spec.lock
        ? { value: value ?? null, locked: manualFields.includes(spec.lock) }
        : { value: value ?? null };
    }
    return state;
  }

  /**
   * Writes fields through the domain service, which locks each one. Issue
   * moves, collection members and reading list entries have their own paths
   * (move_items, setCollectionMembers and setReadingListEntries).
   */
  async write(
    user: AuthenticatedUser,
    type: EntityType,
    id: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    if (Object.keys(values).length === 0) return;
    switch (type) {
      case 'comic_series':
        await this.comicsService.updateSeries(id, values as ComicSeriesUpdate);
        return;
      case 'comic_issue':
        await this.comicsService.updateBook(id, values as ComicBookUpdate);
        return;
      case 'audiobook':
        await this.audiobooksService.update(id, toBookDto(values));
        return;
      case 'ebook':
        await this.ebooksService.update(
          id,
          toBookDto(values) as UpdateEbookDto,
          user.id,
        );
        return;
      case 'book_series':
        await this.seriesService.update(id, { name: String(values.name) });
        return;
      case 'comic_collection':
        await this.collectionsService.update(
          id,
          values as Parameters<ComicsCollectionsService['update']>[1],
        );
        return;
      case 'reading_list':
        await this.readingListsService.update(
          id,
          values as Parameters<ReadingListsService['update']>[1],
        );
        return;
    }
  }

  /** Removes a field's lock. Returns false if it was not locked. */
  async unlock(type: EntityType, id: string, field: string): Promise<boolean> {
    const lock = FIELDS[type][field]?.lock;
    if (!lock) return false;
    switch (type) {
      case 'comic_series':
        return this.comicsService.unlockSeriesField(id, lock);
      case 'comic_issue':
        return this.comicsService.unlockBookField(id, lock);
      case 'audiobook':
        return this.audiobooksService.unlockField(id, lock);
      case 'ebook':
        return this.ebooksService.unlockField(id, lock);
      default:
        return false;
    }
  }

  /** Locked field names (as FIELDS names them) on an entity. */
  async lockedFields(type: EntityType, id: string): Promise<string[]> {
    const { manualFields } = await this.loadRow(type, id);
    return Object.entries(FIELDS[type])
      .filter(([, spec]) => spec.lock && manualFields.includes(spec.lock))
      .map(([name]) => name);
  }

  /** Collection members, in order. */
  async collectionMembers(collectionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ seriesId: comicsSchema.comicCollectionSeries.seriesId })
      .from(comicsSchema.comicCollectionSeries)
      .where(eq(comicsSchema.comicCollectionSeries.collectionId, collectionId))
      .orderBy(
        asc(comicsSchema.comicCollectionSeries.position),
        asc(comicsSchema.comicCollectionSeries.seriesId),
      );
    return rows.map((r) => r.seriesId);
  }

  /**
   * Makes a collection's members exactly `seriesIds`, in that order. Series
   * that no longer exist are left out.
   */
  async setCollectionMembers(
    collectionId: string,
    seriesIds: string[],
  ): Promise<void> {
    const existing = new Set(await this.existingSeries(seriesIds));
    const wanted = seriesIds.filter((id) => existing.has(id));
    const current = await this.collectionMembers(collectionId);

    for (const seriesId of current) {
      if (!wanted.includes(seriesId)) {
        await this.collectionsService.removeSeries(collectionId, seriesId);
      }
    }
    for (const seriesId of wanted) {
      if (!current.includes(seriesId)) {
        await this.collectionsService.addSeries(collectionId, seriesId);
      }
    }
    await this.collectionsService.reorder(collectionId, wanted);
  }

  /** Reading list entries, in order, with their notes. */
  readingListEntries(readingListId: string): Promise<ReadingListEntryState[]> {
    return this.readingListsService.entryStates(readingListId);
  }

  /**
   * Makes a reading list hold exactly these entries, in this order. Items
   * that no longer exist are left out.
   */
  setReadingListEntries(
    readingListId: string,
    entries: ReadingListEntryState[],
  ): Promise<void> {
    return this.readingListsService.setEntries(readingListId, entries);
  }

  /** The ids among `ids` that are comic series. */
  async existingSeries(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: comicsSchema.comicSeries.id })
      .from(comicsSchema.comicSeries)
      .where(inArray(comicsSchema.comicSeries.id, ids));
    return rows.map((r) => r.id);
  }

  // ===== Reading =====

  /**
   * The entity's scalar fields under their FIELDS names, and its lock keys.
   * Relations are left to readRelation.
   */
  private async loadRow(
    type: EntityType,
    id: string,
  ): Promise<{ row: Record<string, unknown>; manualFields: string[] }> {
    const c = comicsSchema;
    const a = audiobooksSchema;
    const e = ebooksSchema;
    const r = readingListsSchema;
    let found: { row: Record<string, unknown>; manualFields: string[] } | null =
      null;

    switch (type) {
      case 'comic_series': {
        const [s] = await this.db
          .select()
          .from(c.comicSeries)
          .where(eq(c.comicSeries.id, id))
          .limit(1);
        if (s) {
          found = {
            row: {
              title: s.title,
              sortTitle: s.sortTitle,
              description: s.description,
              publisher: s.publisher,
              imprint: s.imprint,
              startYear: s.startYear,
              totalIssueCount: s.totalIssueCount,
              language: s.language,
              ageRating: s.ageRating,
            },
            manualFields: s.manualFields ?? [],
          };
        }
        break;
      }
      case 'comic_issue': {
        const [b] = await this.db
          .select()
          .from(c.comicBooks)
          .where(eq(c.comicBooks.id, id))
          .limit(1);
        if (b) {
          found = {
            row: {
              title: b.title,
              number: b.number,
              format: b.format,
              coverDate: b.coverDate,
              summary: b.summary,
              collects: b.collects,
              ageRating: b.ageRating,
              series: b.seriesId,
            },
            manualFields: b.manualFields ?? [],
          };
        }
        break;
      }
      case 'audiobook': {
        const [b] = await this.db
          .select()
          .from(a.audiobooks)
          .where(eq(a.audiobooks.id, id))
          .limit(1);
        if (b) found = { row: bookRow(b), manualFields: b.manualFields ?? [] };
        break;
      }
      case 'ebook': {
        const [b] = await this.db
          .select()
          .from(e.ebooks)
          .where(eq(e.ebooks.id, id))
          .limit(1);
        if (b) {
          found = {
            row: { ...bookRow(b), pageCount: b.pageCount },
            manualFields: b.manualFields ?? [],
          };
        }
        break;
      }
      case 'book_series': {
        const [s] = await this.db
          .select({ name: a.series.name })
          .from(a.series)
          .where(eq(a.series.id, id))
          .limit(1);
        if (s) found = { row: { name: s.name }, manualFields: [] };
        break;
      }
      case 'comic_collection': {
        const [col] = await this.db
          .select()
          .from(c.comicCollections)
          .where(eq(c.comicCollections.id, id))
          .limit(1);
        if (col) {
          found = {
            row: {
              name: col.name,
              sortName: col.sortName,
              description: col.description,
            },
            manualFields: [],
          };
        }
        break;
      }
      case 'reading_list': {
        const [list] = await this.db
          .select()
          .from(r.readingLists)
          .where(eq(r.readingLists.id, id))
          .limit(1);
        if (list) {
          found = {
            row: {
              name: list.name,
              sortName: list.sortName,
              description: list.description,
            },
            manualFields: [],
          };
        }
        break;
      }
    }

    if (!found) throw new NotFoundException(`${ENTITY_NAMES[type]} not found`);
    return found;
  }

  private async readRelation(
    type: EntityType,
    id: string,
    field: string,
  ): Promise<unknown> {
    const c = comicsSchema;
    const a = audiobooksSchema;
    const e = ebooksSchema;

    switch (`${type}.${field}`) {
      case 'comic_series.genres':
        return sortedNames(
          this.db
            .select({ name: a.genres.name })
            .from(c.comicSeriesGenres)
            .innerJoin(a.genres, eq(c.comicSeriesGenres.genreId, a.genres.id))
            .where(eq(c.comicSeriesGenres.seriesId, id)),
        );
      case 'comic_series.tags':
        return sortedNames(
          this.db
            .select({ name: a.tags.name })
            .from(c.comicSeriesTags)
            .innerJoin(a.tags, eq(c.comicSeriesTags.tagId, a.tags.id))
            .where(eq(c.comicSeriesTags.seriesId, id)),
        );
      case 'comic_series.mainCharacters': {
        const characters = await loadMainCharacters(this.db, [id]);
        return (characters.get(id) ?? []).map((ch) => ch.name);
      }
      case 'comic_issue.creators':
        return this.db
          .select({ name: a.people.name, role: c.comicBookCreators.role })
          .from(c.comicBookCreators)
          .innerJoin(a.people, eq(c.comicBookCreators.personId, a.people.id))
          .where(eq(c.comicBookCreators.bookId, id))
          .orderBy(
            asc(c.comicBookCreators.role),
            asc(c.comicBookCreators.order),
          );
      case 'audiobook.authors':
        return names(
          this.db
            .select({ name: a.people.name })
            .from(a.audiobookAuthors)
            .innerJoin(a.people, eq(a.audiobookAuthors.personId, a.people.id))
            .where(eq(a.audiobookAuthors.audiobookId, id))
            .orderBy(asc(a.audiobookAuthors.order)),
        );
      case 'audiobook.narrators':
        return names(
          this.db
            .select({ name: a.people.name })
            .from(a.audiobookNarrators)
            .innerJoin(a.people, eq(a.audiobookNarrators.personId, a.people.id))
            .where(eq(a.audiobookNarrators.audiobookId, id))
            .orderBy(asc(a.audiobookNarrators.order)),
        );
      case 'audiobook.genres':
        return sortedNames(
          this.db
            .select({ name: a.genres.name })
            .from(a.audiobookGenres)
            .innerJoin(a.genres, eq(a.audiobookGenres.genreId, a.genres.id))
            .where(eq(a.audiobookGenres.audiobookId, id)),
        );
      case 'ebook.authors':
        return names(
          this.db
            .select({ name: a.people.name })
            .from(e.ebookAuthors)
            .innerJoin(a.people, eq(e.ebookAuthors.personId, a.people.id))
            .where(eq(e.ebookAuthors.ebookId, id))
            .orderBy(asc(e.ebookAuthors.order)),
        );
      case 'ebook.genres':
        return sortedNames(
          this.db
            .select({ name: a.genres.name })
            .from(e.ebookGenres)
            .innerJoin(a.genres, eq(e.ebookGenres.genreId, a.genres.id))
            .where(eq(e.ebookGenres.ebookId, id)),
        );
      case 'comic_collection.members':
        return this.collectionMembers(id);
      case 'reading_list.entries':
        return this.readingListEntries(id);
      default:
        throw new BadRequestException(
          `${field} is not a field of a ${ENTITY_NAMES[type].toLowerCase()}`,
        );
    }
  }
}

function bookRow(book: {
  title: string;
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  language: string | null;
  publishedDate: string | null;
  isbn: string | null;
  asin: string | null;
}): Record<string, unknown> {
  return {
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    publisher: book.publisher,
    language: book.language,
    publishedDate: book.publishedDate,
    isbn: book.isbn,
    asin: book.asin,
  };
}

/** The book update DTO, with relation fields under the names it uses. */
function toBookDto(values: Record<string, unknown>): UpdateAudiobookDto {
  const { authors, narrators, genres, ...scalars } = values;
  return {
    ...scalars,
    ...(authors !== undefined ? { authorNames: authors as string[] } : {}),
    ...(narrators !== undefined
      ? { narratorNames: narrators as string[] }
      : {}),
    ...(genres !== undefined ? { genreNames: genres as string[] } : {}),
  } as UpdateAudiobookDto;
}

async function names(rows: Promise<{ name: string }[]>): Promise<string[]> {
  return (await rows).map((r) => r.name);
}

/** Genres and tags have no order; sorting makes before and after comparable. */
async function sortedNames(
  rows: Promise<{ name: string }[]>,
): Promise<string[]> {
  return (await names(rows)).sort((x, y) => x.localeCompare(y));
}
