import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AudiobooksService } from '../audiobooks/audiobooks.service';
import { EbooksService } from '../ebooks/ebooks.service';
import { ComicsService } from '../comics/comics.service';
import { ComicvineService } from '../comicvine/comicvine.service';
import { scoreVolumeMatch } from '../comicvine/utils/match-confidence';
import { localSeriesFor } from '../comicvine/utils/search-query';
import type { CvVolumeRaw } from '../comicvine/dto/comicvine.dto';
import {
  HardcoverService,
  type HardcoverSearchResponse,
} from '../hardcover/hardcover.service';
import {
  GrFinderService,
  type GrFinderSearchResult,
} from '../gr-finder/gr-finder.service';
import { AudnexusService } from '../audnexus/audnexus.service';
import type { AudibleSearchResult } from '../audnexus/types/audible-search.types';
import { ItunesService } from '../itunes/itunes.service';
import type { ItunesSearchResult } from '../itunes/types/itunes-search.types';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as comicsSchema from '../comics/schema';
import { McpAccessService } from './mcp-access.service';
import type { McpMediaType } from './mcp-inspect.service';

export const EXTERNAL_SOURCES = [
  'comicvine',
  'hardcover',
  'goodreads',
  'audible',
  'itunes',
] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Which sources apply to which media type, and the default for each. */
export const SOURCES_BY_TYPE: Record<McpMediaType, ExternalSource[]> = {
  comic: ['comicvine'],
  audiobook: ['hardcover', 'goodreads', 'audible', 'itunes'],
  ebook: ['hardcover', 'goodreads', 'itunes'],
};

/** Sources whose REST routes are admin-only (RolesGuard + @Roles('admin')). */
const ADMIN_SOURCES: ReadonlySet<ExternalSource> = new Set([
  'comicvine',
  'hardcover',
  'goodreads',
]);

const SOURCE_NAMES: Record<ExternalSource, string> = {
  comicvine: 'ComicVine',
  hardcover: 'Hardcover',
  goodreads: 'Goodreads',
  audible: 'Audible',
  itunes: 'iTunes',
};

/** Candidates kept from a source's result page. */
const RESULT_LIMIT = 10;

/** ComicVine only matches volume names that contain the searched text. */
const COMICVINE_EMPTY_HINT =
  'No volume name contains this text. Try fewer words, without year, issue numbers or edition.';

export interface SearchExternalArgs {
  mediaType: McpMediaType;
  source?: ExternalSource;
  query: string;
  author?: string;
  page?: number;
}

export interface MatchCandidatesArgs {
  mediaType: McpMediaType;
  id: string;
  source?: ExternalSource;
}

/**
 * `search_external` and `get_match_candidates`.
 *
 * Each source keeps its REST guard: ComicVine, Hardcover and Goodreads are
 * admin-only (they run on the admin's API keys and rate limits), Audible and
 * iTunes are open to any signed-in user. Results are cut down to what helps
 * pick a match.
 */
@Injectable()
export class McpExternalService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof comicsSchema>,
    private readonly access: McpAccessService,
    private readonly audiobooksService: AudiobooksService,
    private readonly ebooksService: EbooksService,
    private readonly comicsService: ComicsService,
    private readonly comicvineService: ComicvineService,
    private readonly hardcoverService: HardcoverService,
    private readonly grFinderService: GrFinderService,
    private readonly audnexusService: AudnexusService,
    private readonly itunesService: ItunesService,
    private readonly metadataResolver: MetadataResolverService,
  ) {}

  async search(
    user: AuthenticatedUser,
    args: SearchExternalArgs,
  ): Promise<object> {
    const source = await this.allowedSource(user, args.mediaType, args.source);
    const page = args.page ?? 1;

    switch (source) {
      case 'comicvine': {
        const result = await this.comicvineService.searchVolumes(
          args.query,
          page,
        );
        return {
          source,
          query: result.query,
          total: result.totalResults,
          results: result.results.slice(0, RESULT_LIMIT).map(toVolume),
          ...(result.totalResults === 0 && { hint: COMICVINE_EMPTY_HINT }),
        };
      }
      case 'hardcover': {
        const result = await this.hardcoverService.searchBooks(
          args.query,
          page,
          RESULT_LIMIT,
        );
        if (!result.success || !result.data) {
          throw new BadRequestException(result.error ?? 'Search failed');
        }
        return { source, ...hardcoverResults(result.data) };
      }
      case 'goodreads': {
        const result = await this.grFinderService.search(args.query);
        return {
          source,
          results: result.results.slice(0, RESULT_LIMIT).map(toGoodreads),
        };
      }
      case 'audible': {
        const results = await this.audnexusService.searchAudible(
          args.query,
          args.author,
        );
        return {
          source,
          results: results.slice(0, RESULT_LIMIT).map(toAudible),
        };
      }
      case 'itunes': {
        const results = await this.itunesService.search(
          args.query,
          args.mediaType === 'ebook' ? 'ebook' : 'audiobook',
        );
        return {
          source,
          results: results.slice(0, RESULT_LIMIT).map(toItunes),
        };
      }
    }
  }

  async matchCandidates(
    user: AuthenticatedUser,
    args: MatchCandidatesArgs,
  ): Promise<object> {
    const source = await this.allowedSource(user, args.mediaType, args.source);

    if (args.mediaType === 'comic') {
      return this.comicCandidates(user, args.id);
    }

    const mediaType = args.mediaType;
    if (mediaType === 'audiobook') {
      await this.audiobooksService.verifyNotBlacklisted(args.id, user.id);
    } else {
      await this.ebooksService.verifyNotBlacklisted(args.id, user.id);
    }

    switch (source) {
      case 'hardcover': {
        const result = await this.hardcoverService.searchByMediaIdPaginated(
          mediaType,
          args.id,
          1,
          RESULT_LIMIT,
        );
        if (!result.success || !result.data) {
          throw new BadRequestException(result.error ?? 'Search failed');
        }
        return {
          source,
          query: result.query,
          ...hardcoverResults(result.data),
        };
      }
      case 'goodreads': {
        const result = await this.grFinderService.searchByMediaId(
          mediaType,
          args.id,
        );
        return {
          source,
          query: result.query,
          results: result.results.slice(0, RESULT_LIMIT).map(toGoodreads),
        };
      }
      case 'audible':
      case 'itunes': {
        const resolved = await this.metadataResolver.forMedia(
          mediaType,
          args.id,
        );
        if (!resolved) throw new NotFoundException('Item not found');
        const author = resolved.authorNames[0];
        if (source === 'audible') {
          const results = await this.audnexusService.searchAudible(
            resolved.title,
            author,
          );
          return {
            source,
            query: { title: resolved.title, author: author ?? null },
            results: results.slice(0, RESULT_LIMIT).map(toAudible),
          };
        }
        const term = author ? `${resolved.title} ${author}` : resolved.title;
        const results = await this.itunesService.search(term, mediaType);
        return {
          source,
          query: term,
          results: results.slice(0, RESULT_LIMIT).map(toItunes),
        };
      }
      default:
        throw new BadRequestException(`No candidates from ${source}`);
    }
  }

  /**
   * A series id gives ComicVine volumes scored the way the auto-matcher scores
   * them. An issue id gives issues of the series' linked volume, the ones
   * with the same number first.
   */
  private async comicCandidates(
    user: AuthenticatedUser,
    id: string,
  ): Promise<object> {
    const [book] = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        seriesId: comicsSchema.comicBooks.seriesId,
      })
      .from(comicsSchema.comicBooks)
      .where(eq(comicsSchema.comicBooks.id, id))
      .limit(1);

    if (book) {
      await this.comicsService.verifyBookNotBlacklisted(id, user.id);
      const [result, names] = await Promise.all([
        this.comicvineService.searchIssuesForBook(id),
        this.metadataResolver.forComicBooks([id]),
      ]);
      if (!result.linkedVolume) {
        throw new BadRequestException(
          'The series is not linked to ComicVine. Link the series first.',
        );
      }
      const number = names.get(id)?.number?.trim() ?? null;
      const sameNumber = (n: string | null) =>
        number !== null && n?.trim() === number;
      const issues = [...result.issues].sort(
        (a, b) =>
          Number(sameNumber(b.issueNumber)) - Number(sameNumber(a.issueNumber)),
      );
      return {
        source: 'comicvine',
        level: 'issue',
        number,
        totalInVolume: result.totalResults,
        results: issues.slice(0, RESULT_LIMIT).map((issue) => ({
          issueId: issue.comicvineIssueId,
          number: issue.issueNumber,
          name: issue.name,
          coverDate: issue.coverDate,
          url: issue.siteDetailUrl,
        })),
      };
    }

    const [series] = await this.db
      .select({
        title: comicsSchema.comicSeries.title,
        startYear: comicsSchema.comicSeries.startYear,
      })
      .from(comicsSchema.comicSeries)
      .where(eq(comicsSchema.comicSeries.id, id))
      .limit(1);
    if (!series) {
      throw new NotFoundException('No comic issue or series with this id');
    }
    await this.comicsService.verifySeriesNotBlacklisted(id, user.id);

    const result = await this.comicvineService.searchVolumesForSeries(id);
    const local = localSeriesFor(series.title, series.startYear);
    return {
      source: 'comicvine',
      level: 'series',
      query: result.query,
      ...(result.totalResults === 0 && { hint: COMICVINE_EMPTY_HINT }),
      total: result.totalResults,
      results: result.results.slice(0, RESULT_LIMIT).map((volume) => {
        const { score, autoLinkable } = scoreVolumeMatch(local, {
          id: volume.id,
          name: volume.name,
          startYear: toYear(volume.start_year),
          countOfIssues: volume.count_of_issues ?? null,
        });
        return {
          ...toVolume(volume),
          confidence: autoLinkable ? 'high' : score > 0 ? 'low' : 'none',
        };
      }),
    };
  }

  /**
   * Picks the source (the media type's first when none is given), checks it
   * applies to the media type, and repeats its REST guard.
   */
  private async allowedSource(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    requested: ExternalSource | undefined,
  ): Promise<ExternalSource> {
    const allowed = SOURCES_BY_TYPE[mediaType];
    const source = requested ?? allowed[0];
    if (!allowed.includes(source)) {
      throw new BadRequestException(
        `${SOURCE_NAMES[source]} has no ${mediaType}s. ` +
          `Use one of: ${allowed.join(', ')}`,
      );
    }
    if (ADMIN_SOURCES.has(source)) {
      this.access.requireAdmin(user, SOURCE_NAMES[source]);
    }
    if (source === 'comicvine' && !(await this.comicvineService.getApiKey())) {
      throw new BadRequestException('ComicVine is not set up.');
    }
    return source;
  }
}

function toYear(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const year = parseInt(String(value), 10);
  return Number.isNaN(year) ? null : year;
}

function toVolume(volume: CvVolumeRaw & { isCollected: boolean }) {
  return {
    volumeId: volume.id,
    name: volume.name,
    startYear: toYear(volume.start_year),
    publisher: volume.publisher?.name ?? null,
    issueCount: volume.count_of_issues ?? null,
    collectedEdition: volume.isCollected,
    url: volume.site_detail_url ?? null,
  };
}

function hardcoverResults(data: HardcoverSearchResponse) {
  const { found, hits } = data.search.results;
  return {
    total: found,
    results: hits.slice(0, RESULT_LIMIT).map(({ document: book }) => ({
      id: book.id,
      title: book.title,
      authors: book.author_names,
      series: book.series_names,
      hasAudiobook: book.has_audiobook,
      hasEbook: book.has_ebook,
      slug: book.slug,
    })),
  };
}

function toGoodreads(result: GrFinderSearchResult) {
  return {
    goodreadsId: result.goodreads_id,
    title: result.title,
    author: result.author,
    url: result.url,
  };
}

function toAudible(result: AudibleSearchResult) {
  return {
    asin: result.asin,
    title: result.title,
    subtitle: result.subtitle ?? null,
    authors: result.authors,
    narrators: result.narrators,
    releaseDate: result.releaseDate ?? null,
    publisher: result.publisher ?? null,
    language: result.language ?? null,
  };
}

function toItunes(result: ItunesSearchResult) {
  return {
    id: result.id,
    title: result.title,
    author: result.author ?? null,
    releaseDate: result.releaseDate ?? null,
    genres: result.genres,
  };
}
