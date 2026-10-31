import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ComicvineService } from '../comicvine/comicvine.service';
import {
  HardcoverService,
  type HardcoverBookDocument,
} from '../hardcover/hardcover.service';
import { GrFinderService } from '../gr-finder/gr-finder.service';
import { GoodreadsLinkQueueService } from '../gr-finder/goodreads-link-queue.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { McpAccessService } from './mcp-access.service';
import { McpEntityStore } from './mcp-entity-store';
import { McpChangeLogService } from './mcp-change-log.service';
import { LINK_FIELD_PREFIX, type EntityType } from './mcp-fields';
import type { McpMediaType } from './mcp-inspect.service';

export const LINK_SOURCES = ['comicvine', 'hardcover', 'goodreads'] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

const SOURCE_NAMES: Record<LinkSource, string> = {
  comicvine: 'ComicVine',
  hardcover: 'Hardcover',
  goodreads: 'Goodreads',
};

/** Hardcover result pages searched for the id before giving up. */
const HARDCOVER_PAGES = 3;
const HARDCOVER_PAGE_SIZE = 25;

export interface LinkArgs {
  mediaType: McpMediaType;
  id: string;
  level?: 'item' | 'series';
  source?: LinkSource;
  externalId: string;
  query?: string;
}

/**
 * link_external: the REST link routes, all admin-only, by external id.
 *
 * - ComicVine, comics: a series to a volume, then its unlinked issues are
 *   queued so the sync matches each to an issue of that volume; or one issue
 *   to an issue.
 * - Hardcover, audiobooks and ebooks: Hardcover has no lookup by id, so the
 *   book is found again in the results for `query`. The link fills in its
 *   metadata at once.
 * - Goodreads, audiobooks and ebooks: queued, as POST /gr-finder/link does.
 *
 * Every link is logged with the previous and new external id. Undo does not
 * reverse links; unlink in the web app.
 */
@Injectable()
export class McpLinkService {
  constructor(
    private readonly access: McpAccessService,
    private readonly store: McpEntityStore,
    private readonly comicvineService: ComicvineService,
    private readonly hardcoverService: HardcoverService,
    private readonly grFinderService: GrFinderService,
    private readonly goodreadsQueue: GoodreadsLinkQueueService,
    private readonly changeLog: McpChangeLogService,
  ) {}

  async link(user: AuthenticatedUser, args: LinkArgs): Promise<object> {
    const source =
      args.source ?? (args.mediaType === 'comic' ? 'comicvine' : 'hardcover');
    const fits =
      args.mediaType === 'comic'
        ? source === 'comicvine'
        : source !== 'comicvine';
    if (!fits) {
      throw new BadRequestException(
        args.mediaType === 'comic'
          ? 'Comics link to comicvine'
          : 'Audiobooks and ebooks link to hardcover or goodreads',
      );
    }
    this.access.requireAdmin(user, SOURCE_NAMES[source]);

    if (source === 'comicvine') return this.linkComic(user, args);
    const type: EntityType =
      args.mediaType === 'audiobook' ? 'audiobook' : 'ebook';
    await this.store.verifyAccess(user, type, args.id);
    return source === 'hardcover'
      ? this.linkHardcover(user, type, args)
      : this.linkGoodreads(user, type, args);
  }

  private async linkComic(
    user: AuthenticatedUser,
    args: LinkArgs,
  ): Promise<object> {
    if (!(await this.comicvineService.getApiKey())) {
      throw new BadRequestException('ComicVine is not set up.');
    }
    const comicvineId = Number(args.externalId);
    if (!Number.isInteger(comicvineId) || comicvineId <= 0) {
      throw new BadRequestException('externalId must be a ComicVine id number');
    }

    const level =
      args.level ??
      ((await this.store.comicEntity(args.id)) === 'comic_issue'
        ? 'item'
        : 'series');
    if (level === 'item') {
      await this.store.verifyAccess(user, 'comic_issue', args.id);
      const previous = await this.comicvineService.getBookLink(args.id);
      const issue = await this.comicvineService.linkBookToIssueId(
        args.id,
        comicvineId,
      );
      const changeSetId = await this.record(
        user,
        'comic_issue',
        args.id,
        'comicvine',
        previous?.comicvineIssueId,
        {
          id: issue.comicvineIssueId,
          number: issue.issueNumber,
          name: issue.name,
        },
      );
      return {
        changeSetId,
        linked: {
          issueId: issue.comicvineIssueId,
          number: issue.issueNumber,
          name: issue.name,
          coverDate: issue.coverDate,
        },
      };
    }

    await this.store.verifyAccess(user, 'comic_series', args.id);
    const previous = await this.comicvineService.getSeriesLink(args.id);
    const volume = await this.comicvineService.linkSeriesToVolumeId(
      args.id,
      comicvineId,
    );
    const issuesQueued = await this.comicvineService.queueSeriesBooks(args.id);
    const changeSetId = await this.record(
      user,
      'comic_series',
      args.id,
      'comicvine',
      previous?.comicvineVolumeId,
      {
        id: volume.comicvineVolumeId,
        name: volume.name,
        startYear: volume.startYear,
      },
    );
    return {
      changeSetId,
      linked: {
        volumeId: volume.comicvineVolumeId,
        name: volume.name,
        startYear: volume.startYear,
        publisher: volume.publisherName,
        issueCount: volume.countOfIssues,
      },
      issuesQueued,
    };
  }

  private async linkHardcover(
    user: AuthenticatedUser,
    type: 'audiobook' | 'ebook',
    args: LinkArgs,
  ): Promise<object> {
    if (!args.query) {
      throw new BadRequestException(
        'Hardcover has no lookup by id. Pass the search query that found the book as `query`.',
      );
    }
    const book = await this.findHardcoverBook(args.query, args.externalId);
    const previous = await this.hardcoverService.getHardcoverLink(
      type,
      args.id,
    );
    const linked = await this.hardcoverService.linkMediaToHardcover(
      type,
      args.id,
      book,
    );
    const changeSetId = await this.record(
      user,
      type,
      args.id,
      'hardcover',
      previous?.hardcoverId,
      {
        id: linked.hardcoverId,
        title: linked.title,
      },
    );
    return {
      changeSetId,
      linked: {
        id: linked.hardcoverId,
        title: linked.title,
        authors: linked.authorNames,
      },
    };
  }

  private async linkGoodreads(
    user: AuthenticatedUser,
    type: 'audiobook' | 'ebook',
    args: LinkArgs,
  ): Promise<object> {
    await this.grFinderService.assertMediaExists(type, args.id);
    const previous = await this.grFinderService.getGoodreadsLink(type, args.id);
    this.goodreadsQueue.enqueue({
      mediaType: type,
      mediaId: args.id,
      goodreadsId: args.externalId,
    });
    const changeSetId = await this.record(
      user,
      type,
      args.id,
      'goodreads',
      previous?.goodreadsId,
      {
        id: args.externalId,
        queued: true,
      },
    );
    return {
      changeSetId,
      queued: true,
      note: 'Reading the Goodreads page runs in the background and can take minutes.',
    };
  }

  private async findHardcoverBook(
    query: string,
    hardcoverId: string,
  ): Promise<HardcoverBookDocument> {
    for (let page = 1; page <= HARDCOVER_PAGES; page++) {
      const result = await this.hardcoverService.searchBooks(
        query,
        page,
        HARDCOVER_PAGE_SIZE,
      );
      if (!result.success || !result.data) {
        throw new BadRequestException(
          result.error ?? 'Hardcover search failed',
        );
      }
      const { hits } = result.data.search.results;
      const hit = hits.find((h) => String(h.document.id) === hardcoverId);
      if (hit) return hit.document;
      if (hits.length < HARDCOVER_PAGE_SIZE) break;
    }
    throw new NotFoundException(
      `Hardcover book ${hardcoverId} is not in the results for "${query}"`,
    );
  }

  private record(
    user: AuthenticatedUser,
    type: EntityType,
    id: string,
    source: LinkSource,
    previousId: string | number | null | undefined,
    after: Record<string, unknown>,
  ): Promise<string | null> {
    return this.changeLog.record(user, 'link_external', [
      {
        entityType: type,
        entityId: id,
        field: `${LINK_FIELD_PREFIX}${source}`,
        before: { id: previousId ?? null },
        after,
      },
    ]);
  }
}
