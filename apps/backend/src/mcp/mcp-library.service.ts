import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, eq, ne } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { ComicsService } from '../comics/comics.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as comicsSchema from '../comics/schema';
import { MetadataGapsService } from '../metadata-gaps/metadata-gaps.service';
import {
  AUDIOBOOK_GAP_KEYS,
  COMIC_GAP_KEYS,
  EBOOK_GAP_KEYS,
} from '../metadata-gaps/gap-definitions';
import type { GapSort } from '../metadata-gaps/dto/metadata-gaps.dto';
import { McpAccessService } from './mcp-access.service';
import type { McpMediaType } from './mcp-inspect.service';

export const GAP_KEYS_BY_TYPE: Record<McpMediaType, readonly string[]> = {
  audiobook: AUDIOBOOK_GAP_KEYS,
  ebook: EBOOK_GAP_KEYS,
  comic: COMIC_GAP_KEYS,
};

export interface FindItemsArgs {
  mediaType: McpMediaType;
  missing?: string[];
  match?: 'any' | 'all';
  unlinked?: boolean;
  noSeries?: boolean;
  withGaps?: boolean;
  search?: string;
  sort?: GapSort;
  limit?: number;
  offset?: number;
}

export const FIND_ITEMS_DEFAULT_LIMIT = 25;

/**
 * `library_overview` and `find_items`, both built on the metadata-gaps
 * worklist so the agent and the web worklist agree on what "missing" means.
 * The worklist's REST routes need edit-metadata, so these do too.
 */
@Injectable()
export class McpLibraryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof comicsSchema>,
    private readonly access: McpAccessService,
    private readonly gaps: MetadataGapsService,
    private readonly comicsService: ComicsService,
  ) {}

  async overview(user: AuthenticatedUser): Promise<object> {
    await this.access.requireEditMetadata(user);

    const options = { viewerId: user.id };
    const [audiobook, ebook, comic, issues] = await Promise.all([
      this.gaps.getSummary('audiobook', options),
      this.gaps.getSummary('ebook', options),
      this.gaps.getSummary('comic', options),
      this.visibleComicIssueCount(user.id),
    ]);

    const counts = (summary: typeof audiobook) =>
      Object.fromEntries(
        summary.gaps
          .filter((gap) => gap.count > 0)
          .map((gap) => [gap.key, gap.count]),
      );

    return {
      audiobooks: {
        items: audiobook.totalItems,
        needAttention: audiobook.itemsWithGaps,
        missing: counts(audiobook),
      },
      ebooks: {
        items: ebook.totalItems,
        needAttention: ebook.itemsWithGaps,
        missing: counts(ebook),
      },
      comics: {
        series: comic.totalItems,
        issues,
        seriesNeedAttention: comic.itemsWithGaps,
        missing: counts(comic),
      },
      you: { admin: user.role === 'admin' },
    };
  }

  async findItems(
    user: AuthenticatedUser,
    args: FindItemsArgs,
  ): Promise<object> {
    await this.access.requireEditMetadata(user);

    const valid = GAP_KEYS_BY_TYPE[args.mediaType];
    const unknown = (args.missing ?? []).filter((key) => !valid.includes(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown gap for ${args.mediaType}: ${unknown.join(', ')}. ` +
          `Use one of: ${valid.join(', ')}`,
      );
    }

    const limit = args.limit ?? FIND_ITEMS_DEFAULT_LIMIT;
    const offset = args.offset ?? 0;
    const result = await this.gaps.list(
      {
        type: args.mediaType,
        missing: args.missing,
        match: args.match,
        search: args.search,
        sort: args.sort,
        limit,
        offset,
      },
      {
        viewerId: user.id,
        unlinked: args.unlinked,
        withoutSeries: args.noSeries,
        includeComplete: args.withGaps === false,
      },
    );

    return {
      total: result.total,
      offset,
      ...(offset + result.items.length < result.total
        ? { nextOffset: offset + result.items.length }
        : {}),
      items: result.items.map((item) => ({
        id: item.id,
        title: item.title,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        gaps: item.gaps,
      })),
    };
  }

  /** Issues the user can see: not hidden, in a visible series. */
  private async visibleComicIssueCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(comicsSchema.comicBooks)
      .innerJoin(
        comicsSchema.comicSeries,
        eq(comicsSchema.comicBooks.seriesId, comicsSchema.comicSeries.id),
      )
      .where(
        and(
          ne(comicsSchema.comicBooks.status, 'hidden'),
          ...this.comicsService.visibleSeriesConditions(userId),
        ),
      );
    return Number(row?.value ?? 0);
  }
}
