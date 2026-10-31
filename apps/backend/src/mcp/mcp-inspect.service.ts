import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { MetadataFieldPriority } from '../app-settings/schema';
import { AudiobooksService } from '../audiobooks/audiobooks.service';
import { EbooksService } from '../ebooks/ebooks.service';
import { ComicsService } from '../comics/comics.service';
import { SeriesService } from '../series/series.service';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { isSafeRelativePath } from '../common/utils/path-containment.util';
import { splitPersonNames } from '../common/utils/name.utils';
import { resolveExternalTitle } from '../common/utils/title.utils';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import * as comicvineSchema from '../comicvine/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import * as usersSchema from '../users/schema';
import {
  reportField,
  reportLocal,
  reportRelation,
  type FieldReport,
} from './field-report';

type InspectDatabase = NodePgDatabase<
  typeof audiobooksSchema &
    typeof ebooksSchema &
    typeof comicsSchema &
    typeof comicvineSchema &
    typeof hardcoverSchema &
    typeof goodreadsSchema &
    typeof usersSchema
>;

export type McpMediaType = 'audiobook' | 'ebook' | 'comic';

/** How many audio files `get_item` lists before summarising the rest. */
const FILE_LIST_LIMIT = 20;
/** Aggregated issue tags (story arcs, appearances) kept per series. */
const TAG_LIST_LIMIT = 25;

export interface IssuePage {
  offset?: number;
  limit?: number;
}

/**
 * The `get_item` and `get_series` tools.
 *
 * Every field is reported with the value the app shows, the source it came
 * from and what the other sources hold, so the agent can tell a ComicVine
 * description from a hand-edit before it changes anything. Values are
 * resolved with the same metadata priority the detail pages use.
 *
 * Paths are the stored ones, which are relative to the library root. A stored
 * path that is not a safe relative path (it can come from a crafted backup) is
 * reported as null rather than shown.
 */
@Injectable()
export class McpInspectService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: InspectDatabase,
    private readonly appSettings: AppSettingsService,
    private readonly audiobooksService: AudiobooksService,
    private readonly ebooksService: EbooksService,
    private readonly comicsService: ComicsService,
    private readonly seriesService: SeriesService,
    private readonly metadataResolver: MetadataResolverService,
  ) {}

  async getItem(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    id: string,
  ): Promise<object> {
    switch (mediaType) {
      case 'comic':
        return this.getComicIssue(user, id);
      case 'audiobook':
        await this.audiobooksService.verifyNotBlacklisted(id, user.id);
        return this.getBook('audiobook', id);
      case 'ebook':
        await this.ebooksService.verifyNotBlacklisted(id, user.id);
        return this.getBook('ebook', id);
    }
  }

  async getSeries(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    id: string,
    page: IssuePage = {},
  ): Promise<object> {
    return mediaType === 'comic'
      ? this.getComicSeries(user, id, page)
      : this.getBookSeries(user, id);
  }

  // ===== Comics =====

  private async getComicSeries(
    user: AuthenticatedUser,
    id: string,
    { offset = 0, limit = 50 }: IssuePage,
  ): Promise<object> {
    // Checks the blacklist and existence the way GET /comics/series/:id does.
    const detail = await this.comicsService.getSeriesById(id, user.id);

    const [[row], priority] = await Promise.all([
      this.db
        .select({
          series: comicsSchema.comicSeries,
          volume: comicvineSchema.comicvineVolumes,
        })
        .from(comicsSchema.comicSeries)
        .leftJoin(
          comicvineSchema.comicvineVolumeLinks,
          eq(comicvineSchema.comicvineVolumeLinks.seriesId, id),
        )
        .leftJoin(
          comicvineSchema.comicvineVolumes,
          eq(
            comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
            comicvineSchema.comicvineVolumes.id,
          ),
        )
        .where(eq(comicsSchema.comicSeries.id, id))
        .limit(1),
      this.appSettings.getComicMetadataPriority(),
    ]);
    if (!row) throw new NotFoundException('Comic series not found');

    const { series, volume } = row;
    const mf = series.manualFields ?? [];
    // `undefined` marks ComicVine as not linked, so the report leaves it out.
    const cv = <T>(value: T | null | undefined) =>
      volume ? (value ?? null) : undefined;

    const pageBooks = detail.books.slice(offset, offset + limit);
    const [resolved, paths] = await Promise.all([
      this.metadataResolver.forComicBooks(pageBooks.map((b) => b.id)),
      this.comicBookPaths(pageBooks.map((b) => b.id)),
    ]);

    return {
      type: 'comic',
      kind: 'series',
      id: series.id,
      status: series.status,
      path: safePath(series.folderPath),
      fields: {
        title: reportField(
          'title',
          {
            manual: series.title,
            embedded: series.title,
            comicvine: cv(volume?.name),
          },
          priority.title,
          mf,
        ),
        description: reportField(
          'description',
          {
            manual: series.description,
            embedded: series.description,
            comicvine: cv(volume?.description),
          },
          priority.description,
          mf,
        ),
        publisher: reportField(
          'publisher',
          {
            manual: series.publisher,
            embedded: series.publisher,
            comicvine: cv(volume?.publisherName),
          },
          priority.publisher,
          mf,
        ),
        startYear: reportField(
          'startYear',
          {
            manual: series.startYear,
            embedded: series.startYear,
            comicvine: cv(volume?.startYear),
          },
          priority.startYear,
          mf,
        ),
        sortTitle: reportLocal('sortTitle', series.sortTitle, mf),
        imprint: reportLocal('imprint', series.imprint, mf),
        totalIssueCount: reportLocal(
          'totalIssueCount',
          series.totalIssueCount,
          mf,
        ),
        language: reportLocal('language', series.language, mf),
        ageRating: reportLocal('ageRating', series.ageRating, mf),
      },
      mainCharacters: {
        value: detail.mainCharacters.map((c) => c.name),
        ...(mf.includes('mainCharacters') ? { locked: true } : {}),
      },
      genres: detail.genres.map((g) => g.name),
      tags: detail.tags.map((t) => t.name),
      comicvine: volume
        ? {
            volumeId: volume.comicvineVolumeId,
            name: volume.name,
            startYear: volume.startYear,
            publisher: volume.publisherName,
            issueCount: volume.countOfIssues,
            url: volume.siteDetailUrl,
          }
        : null,
      creators: groupCreators(detail.creators),
      storyArcs: detail.aggregatedTags.storyArcs.slice(0, TAG_LIST_LIMIT),
      appearances: detail.aggregatedTags.characters.slice(0, TAG_LIST_LIMIT),
      collections: detail.collections.map((c) => c.name),
      missingIssueNumbers: detail.gaps,
      issues: {
        total: detail.books.length,
        offset,
        items: pageBooks.map((book) => {
          const names = resolved.get(book.id);
          return {
            id: book.id,
            number: names?.number ?? book.number,
            title: names?.title ?? book.title,
            format: book.format,
            coverDate: book.coverDate,
            path: safePath(paths.get(book.id)),
          };
        }),
      },
    };
  }

  private async getComicIssue(
    user: AuthenticatedUser,
    id: string,
  ): Promise<object> {
    // Checks the blacklist and existence the way GET /comics/books/:id does.
    const detail = await this.comicsService.getBookById(id, user.id);

    const [[row], priority] = await Promise.all([
      this.db
        .select({
          book: comicsSchema.comicBooks,
          issue: comicvineSchema.comicvineIssues,
        })
        .from(comicsSchema.comicBooks)
        .leftJoin(
          comicvineSchema.comicvineIssueLinks,
          eq(comicvineSchema.comicvineIssueLinks.bookId, id),
        )
        .leftJoin(
          comicvineSchema.comicvineIssues,
          eq(
            comicvineSchema.comicvineIssueLinks.comicvineIssueRowId,
            comicvineSchema.comicvineIssues.id,
          ),
        )
        .where(eq(comicsSchema.comicBooks.id, id))
        .limit(1),
      this.appSettings.getComicMetadataPriority(),
    ]);
    if (!row) throw new NotFoundException('Comic book not found');

    const { book, issue } = row;
    const mf = book.manualFields ?? [];
    const cv = <T>(value: T | null | undefined) =>
      issue ? (value ?? null) : undefined;

    return {
      type: 'comic',
      kind: 'issue',
      id: book.id,
      series: detail.series,
      status: book.status,
      format: book.format,
      path: safePath(book.filePath),
      file: {
        container: book.container,
        sizeBytes: book.sizeBytes,
        pages: book.pageCount,
      },
      fields: {
        title: reportField(
          'title',
          {
            manual: book.title,
            embedded: book.title,
            comicvine: cv(issue?.name),
          },
          priority.bookTitle,
          mf,
        ),
        number: reportField(
          'number',
          {
            manual: book.number,
            embedded: book.number,
            comicvine: cv(issue?.issueNumber),
          },
          priority.bookNumber,
          mf,
        ),
        coverDate: reportField(
          'coverDate',
          {
            manual: book.coverDate,
            embedded: book.coverDate,
            comicvine: cv(issue?.coverDate),
          },
          priority.coverDate,
          mf,
        ),
        summary: reportField(
          'summary',
          {
            manual: book.summary,
            embedded: book.summary,
            comicvine: cv(issue?.description),
          },
          priority.bookSummary,
          mf,
        ),
        storeDate: reportLocal('storeDate', book.storeDate, mf),
        collects: reportLocal('collects', book.collects, mf),
        language: reportLocal('language', book.language, mf),
        ageRating: reportLocal('ageRating', book.ageRating, mf),
      },
      creators: groupCreators(detail.creators),
      tags: nonEmpty({ ...detail.metadataTags }),
      comicvine: issue
        ? {
            issueId: issue.comicvineIssueId,
            name: issue.name,
            number: issue.issueNumber,
            coverDate: issue.coverDate,
            url: issue.siteDetailUrl,
            credits: issue.personCredits ?? [],
          }
        : null,
    };
  }

  private async comicBookPaths(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        filePath: comicsSchema.comicBooks.filePath,
      })
      .from(comicsSchema.comicBooks)
      .where(inArray(comicsSchema.comicBooks.id, ids));
    return new Map(rows.map((r) => [r.id, r.filePath]));
  }

  // ===== Audiobooks and ebooks =====

  private async getBook(
    type: 'audiobook' | 'ebook',
    id: string,
  ): Promise<object> {
    const raw =
      type === 'audiobook'
        ? await this.loadAudiobook(id)
        : await this.loadEbook(id);
    const priority = await this.appSettings.getMetadataPriority();

    return {
      type,
      id,
      status: raw.status,
      path: safePath(raw.filePath),
      ...raw.extra,
      fields: bookFields(raw, priority),
      tags: raw.tags,
      hardcover: raw.hardcover
        ? {
            id: raw.hardcover.hardcoverId,
            title: raw.hardcover.title,
            slug: raw.hardcover.slug,
          }
        : null,
      goodreads: raw.goodreads
        ? {
            id: raw.goodreads.goodreadsId,
            title: raw.goodreads.title,
            url: raw.goodreads.url,
          }
        : null,
    };
  }

  private async loadAudiobook(id: string): Promise<RawBook> {
    const s = audiobooksSchema;
    const [book] = await this.db
      .select()
      .from(s.audiobooks)
      .where(eq(s.audiobooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Audiobook not found');

    const [authors, narrators, series, genres, tags, files, hc, gr] =
      await Promise.all([
        this.db
          .select({ name: s.people.name })
          .from(s.audiobookAuthors)
          .innerJoin(s.people, eq(s.audiobookAuthors.personId, s.people.id))
          .where(eq(s.audiobookAuthors.audiobookId, id))
          .orderBy(asc(s.audiobookAuthors.order)),
        this.db
          .select({ name: s.people.name })
          .from(s.audiobookNarrators)
          .innerJoin(s.people, eq(s.audiobookNarrators.personId, s.people.id))
          .where(eq(s.audiobookNarrators.audiobookId, id))
          .orderBy(asc(s.audiobookNarrators.order)),
        this.db
          .select({ name: s.series.name, order: s.audiobookSeries.order })
          .from(s.audiobookSeries)
          .innerJoin(s.series, eq(s.audiobookSeries.seriesId, s.series.id))
          .where(eq(s.audiobookSeries.audiobookId, id)),
        this.db
          .select({ name: s.genres.name })
          .from(s.audiobookGenres)
          .innerJoin(s.genres, eq(s.audiobookGenres.genreId, s.genres.id))
          .where(eq(s.audiobookGenres.audiobookId, id)),
        this.db
          .select({ name: s.tags.name })
          .from(s.audiobookTags)
          .innerJoin(s.tags, eq(s.audiobookTags.tagId, s.tags.id))
          .where(eq(s.audiobookTags.audiobookId, id)),
        this.db
          .select({ filePath: s.audiobookFiles.filePath })
          .from(s.audiobookFiles)
          .where(eq(s.audiobookFiles.audiobookId, id))
          .orderBy(asc(s.audiobookFiles.order)),
        this.db
          .select({ book: hardcoverSchema.hardcoverBooks })
          .from(hardcoverSchema.hardcoverAudiobookLinks)
          .innerJoin(
            hardcoverSchema.hardcoverBooks,
            eq(
              hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
              hardcoverSchema.hardcoverBooks.id,
            ),
          )
          .where(eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, id))
          .limit(1),
        this.db
          .select({ book: goodreadsSchema.goodreadsBooks })
          .from(goodreadsSchema.goodreadsAudiobookLinks)
          .innerJoin(
            goodreadsSchema.goodreadsBooks,
            eq(
              goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
              goodreadsSchema.goodreadsBooks.id,
            ),
          )
          .where(eq(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, id))
          .limit(1),
      ]);

    return {
      ...book,
      manualFields: book.manualFields ?? [],
      authorNames: authors.map((a) => a.name),
      narratorNames: narrators.map((n) => n.name),
      series,
      genres: genres.map((g) => g.name),
      tags: tags.map((t) => t.name),
      pageCount: undefined,
      hardcover: hc[0]?.book ?? null,
      goodreads: gr[0]?.book ?? null,
      extra: {
        durationSeconds: book.duration,
        files: {
          total: files.length,
          paths: files
            .slice(0, FILE_LIST_LIMIT)
            .map((f) => safePath(f.filePath)),
        },
      },
    };
  }

  private async loadEbook(id: string): Promise<RawBook> {
    const s = ebooksSchema;
    const a = audiobooksSchema;
    const [book] = await this.db
      .select()
      .from(s.ebooks)
      .where(eq(s.ebooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Ebook not found');

    const [authors, series, genres, tags, hc, gr] = await Promise.all([
      this.db
        .select({ name: a.people.name })
        .from(s.ebookAuthors)
        .innerJoin(a.people, eq(s.ebookAuthors.personId, a.people.id))
        .where(eq(s.ebookAuthors.ebookId, id))
        .orderBy(asc(s.ebookAuthors.order)),
      this.db
        .select({ name: a.series.name, order: s.ebookSeries.order })
        .from(s.ebookSeries)
        .innerJoin(a.series, eq(s.ebookSeries.seriesId, a.series.id))
        .where(eq(s.ebookSeries.ebookId, id)),
      this.db
        .select({ name: a.genres.name })
        .from(s.ebookGenres)
        .innerJoin(a.genres, eq(s.ebookGenres.genreId, a.genres.id))
        .where(eq(s.ebookGenres.ebookId, id)),
      this.db
        .select({ name: a.tags.name })
        .from(s.ebookTags)
        .innerJoin(a.tags, eq(s.ebookTags.tagId, a.tags.id))
        .where(eq(s.ebookTags.ebookId, id)),
      this.db
        .select({ book: hardcoverSchema.hardcoverBooks })
        .from(hardcoverSchema.hardcoverEbookLinks)
        .innerJoin(
          hardcoverSchema.hardcoverBooks,
          eq(
            hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
            hardcoverSchema.hardcoverBooks.id,
          ),
        )
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, id))
        .limit(1),
      this.db
        .select({ book: goodreadsSchema.goodreadsBooks })
        .from(goodreadsSchema.goodreadsEbookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, id))
        .limit(1),
    ]);

    return {
      ...book,
      manualFields: book.manualFields ?? [],
      authorNames: authors.map((x) => x.name),
      narratorNames: undefined,
      series,
      genres: genres.map((g) => g.name),
      tags: tags.map((t) => t.name),
      hardcover: hc[0]?.book ?? null,
      goodreads: gr[0]?.book ?? null,
      extra: {
        format: book.format,
        file: { name: book.fileName, sizeBytes: book.sizeBytes },
      },
    };
  }

  /**
   * Book series are shared by audiobooks and ebooks, so one call returns both.
   * GET /series/:id applies no blacklist; the MCP drops blacklisted books from
   * the lists, as the library lists do.
   */
  private async getBookSeries(
    user: AuthenticatedUser,
    id: string,
  ): Promise<object> {
    const detail = await this.seriesService.getById(id);
    const [blockedAudiobooks, blockedEbooks] = await Promise.all([
      this.blacklistedIds(
        'audiobook',
        detail.audiobooks.map((b) => b.id),
        user.id,
      ),
      this.blacklistedIds(
        'ebook',
        detail.ebooks.map((b) => b.id),
        user.id,
      ),
    ]);

    const toItem = (book: {
      id: string;
      title: string;
      subtitle: string | null;
      authors: { name: string }[];
      order: string;
      status: string;
    }) => ({
      id: book.id,
      order: book.order,
      title: book.title,
      subtitle: book.subtitle,
      authors: book.authors.map((a) => a.name),
      status: book.status,
    });

    return {
      type: 'series',
      id: detail.id,
      name: detail.name,
      description: detail.description,
      audiobooks: detail.audiobooks
        .filter((b) => !blockedAudiobooks.has(b.id))
        .map(toItem),
      ebooks: detail.ebooks.filter((b) => !blockedEbooks.has(b.id)).map(toItem),
    };
  }

  private async blacklistedIds(
    type: 'audiobook' | 'ebook',
    ids: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { userBlacklistedTags } = usersSchema;
    const rows =
      type === 'audiobook'
        ? await this.db
            .selectDistinct({ id: audiobooksSchema.audiobookTags.audiobookId })
            .from(audiobooksSchema.audiobookTags)
            .innerJoin(
              userBlacklistedTags,
              and(
                eq(
                  audiobooksSchema.audiobookTags.tagId,
                  userBlacklistedTags.tagId,
                ),
                eq(userBlacklistedTags.userId, userId),
              ),
            )
            .where(inArray(audiobooksSchema.audiobookTags.audiobookId, ids))
        : await this.db
            .selectDistinct({ id: ebooksSchema.ebookTags.ebookId })
            .from(ebooksSchema.ebookTags)
            .innerJoin(
              userBlacklistedTags,
              and(
                eq(ebooksSchema.ebookTags.tagId, userBlacklistedTags.tagId),
                eq(userBlacklistedTags.userId, userId),
              ),
            )
            .where(inArray(ebooksSchema.ebookTags.ebookId, ids));
    return new Set(rows.map((r) => r.id));
  }
}

type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;

/** What `bookFields` needs, shared by audiobooks and ebooks. */
export interface RawBook {
  status: string;
  filePath: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  publishedDate: string | null;
  language: string | null;
  isbn: string | null;
  asin: string | null;
  pageCount?: number | null;
  manualFields: string[];
  authorNames: string[];
  narratorNames?: string[];
  series: { name: string; order: string | null }[];
  genres: string[];
  tags: string[];
  hardcover: HardcoverBook | null;
  goodreads: GoodreadsBook | null;
  extra: Record<string, unknown>;
}

/**
 * Field reports for a book, with the same source inputs as the audiobook and
 * ebook detail services: Hardcover and Goodreads feed title, subtitle,
 * description, authors and (Hardcover only) series; every other field is
 * local even where the priority settings list an external source.
 */
export function bookFields(
  raw: RawBook,
  priority: MetadataFieldPriority,
): Record<string, FieldReport<unknown>> {
  const hc = raw.hardcover;
  const gr = raw.goodreads;
  const mf = raw.manualFields;
  const seriesNames = raw.series.map((s) =>
    s.order ? `${s.name} #${s.order}` : s.name,
  );

  const fields: Record<string, FieldReport<unknown>> = {
    title: reportField(
      'title',
      {
        manual: raw.title,
        embedded: raw.title,
        hardcover: hc
          ? resolveExternalTitle(hc.title, hc.subtitle, raw.title, raw.subtitle)
          : undefined,
        goodreads: gr
          ? resolveExternalTitle(gr.title, gr.subtitle, raw.title, raw.subtitle)
          : undefined,
      },
      priority.title,
      mf,
    ),
    subtitle: reportField(
      'subtitle',
      {
        manual: raw.subtitle,
        embedded: raw.subtitle,
        hardcover: hc ? hc.subtitle : undefined,
        goodreads: gr ? gr.subtitle : undefined,
      },
      priority.subtitle,
      mf,
    ),
    description: reportField(
      'description',
      {
        manual: raw.description,
        embedded: raw.description,
        hardcover: hc ? hc.description : undefined,
        goodreads: gr ? gr.description : undefined,
      },
      priority.description,
      mf,
    ),
    authors: reportRelation(
      'author',
      {
        manual: raw.authorNames,
        embedded: raw.authorNames,
        hardcover: hc ? hc.authorNames : undefined,
        goodreads: gr ? splitPersonNames(gr.author) : undefined,
      },
      priority.author,
      mf,
    ),
    series: reportRelation(
      'series',
      {
        manual: seriesNames,
        embedded: seriesNames,
        hardcover: hc
          ? hc.featuredSeriesName
            ? [hc.featuredSeriesName]
            : []
          : undefined,
      },
      priority.series,
      mf,
    ),
    genres: reportLocal('genres', raw.genres, mf),
    publisher: reportLocal('publisher', raw.publisher, mf),
    publishedDate: reportLocal('publishedDate', raw.publishedDate, mf),
    language: reportLocal('language', raw.language, mf),
    isbn: reportLocal('isbn', raw.isbn, mf),
    asin: reportLocal('asin', raw.asin, mf),
  };
  if (raw.narratorNames) {
    fields.narrators = reportLocal('narrator', raw.narratorNames, mf);
  }
  if (raw.pageCount !== undefined) {
    fields.pageCount = reportLocal('pageCount', raw.pageCount, mf);
  }
  return fields;
}

/** A stored relative path, or null if it is not a safe one to show. */
export function safePath(stored: string | null | undefined): string | null {
  return stored && isSafeRelativePath(stored) ? stored : null;
}

/** `{ writer: ['A', 'B'], penciller: ['C'] }` from creator rows. */
function groupCreators(
  creators: { name: string; role: string }[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const { name, role } of creators) {
    const names = (grouped[role] ??= []);
    if (!names.includes(name)) names.push(name);
  }
  return grouped;
}

function nonEmpty(
  lists: Record<string, string[]>,
): Record<string, string[]> | undefined {
  const kept = Object.entries(lists).filter(([, values]) => values.length > 0);
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}
