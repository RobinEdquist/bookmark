import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AudiobooksService } from '../audiobooks/audiobooks.service';
import { EbooksService } from '../ebooks/ebooks.service';
import { ComicsService } from '../comics/comics.service';
import { ComicPageService } from '../comics/comic-page.service';
import { ImageProcessingService } from '../common/image-processing.service';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as comicsSchema from '../comics/schema';
import type { McpMediaType } from './mcp-inspect.service';

/**
 * Longest edge of every image sent to the agent. Big enough to read a cover
 * title and the credits on an indicia page, small enough that a cover plus a
 * few pages stays a modest tool result.
 */
export const VIEW_MAX_EDGE = 1024;
const VIEW_JPEG_QUALITY = 80;

export const VIEW_DEFAULT_PAGES = 3;
export const VIEW_MAX_PAGES = 6;

export interface ViewArgs {
  /** First page to show, 1-based. Page 1 is usually the cover itself. */
  startPage?: number;
  pages?: number;
}

export interface ViewImage {
  label: string;
  data: Buffer;
  mimeType: string;
}

export interface ViewResult {
  summary: Record<string, unknown>;
  images: ViewImage[];
}

/**
 * The `view_item` tool: the cover and, for comics, the first pages, so the
 * agent can identify an issue from what is printed on it.
 *
 * Covers are read the way the cover endpoints read them and pages through
 * ComicPageService (which caches the downscaled variant). A page that cannot
 * be read does not fail the call: the cover is often enough, and the summary
 * says why the pages are missing.
 */
@Injectable()
export class McpViewService {
  private readonly logger = new Logger(McpViewService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof comicsSchema>,
    private readonly audiobooksService: AudiobooksService,
    private readonly ebooksService: EbooksService,
    private readonly comicsService: ComicsService,
    private readonly comicPageService: ComicPageService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  async view(
    user: AuthenticatedUser,
    mediaType: McpMediaType,
    id: string,
    args: ViewArgs = {},
  ): Promise<ViewResult> {
    switch (mediaType) {
      case 'audiobook': {
        await this.audiobooksService.verifyNotBlacklisted(id, user.id);
        const cover = await this.audiobooksService.getCover(id);
        return this.coverOnly(id, cover?.data ?? null);
      }
      case 'ebook': {
        await this.ebooksService.verifyNotBlacklisted(id, user.id);
        const cover = await this.ebooksService.getCover(id);
        return this.coverOnly(id, cover?.data ?? null);
      }
      case 'comic':
        return this.viewComic(user, id, args);
    }
  }

  private async coverOnly(
    id: string,
    cover: Buffer | null,
  ): Promise<ViewResult> {
    const images: ViewImage[] = [];
    if (cover) images.push(await this.downscale('cover', cover));
    return {
      summary: { id, images: images.map((i) => i.label), noCover: !cover },
      images,
    };
  }

  /**
   * `id` may be an issue or a series. For a series, the cover is the series
   * cover (or its first issue's, as the series page shows) and the pages come
   * from its first visible issue.
   */
  private async viewComic(
    user: AuthenticatedUser,
    id: string,
    { startPage = 2, pages = VIEW_DEFAULT_PAGES }: ViewArgs,
  ): Promise<ViewResult> {
    const { comicBooks: books } = comicsSchema;
    const [asIssue] = await this.db
      .select({ id: books.id, pageCount: books.pageCount })
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    let issue: { id: string; pageCount: number | null } | null = asIssue;
    let coverPath: string | null;
    if (asIssue) {
      await this.comicsService.verifyBookNotBlacklisted(id, user.id);
      coverPath = await this.comicsService.getBookCoverFilePath(id);
    } else {
      const [series] = await this.db
        .select({ id: comicsSchema.comicSeries.id })
        .from(comicsSchema.comicSeries)
        .where(eq(comicsSchema.comicSeries.id, id))
        .limit(1);
      if (!series) {
        throw new NotFoundException('No comic issue or series with this id');
      }
      await this.comicsService.verifySeriesNotBlacklisted(id, user.id);
      issue = await this.firstIssue(id);
      coverPath =
        (await this.comicsService.getSeriesCoverFilePath(id)) ??
        (issue ? await this.firstIssueCover(id) : null);
    }

    const images: ViewImage[] = [];
    const notes: string[] = [];

    if (coverPath) {
      images.push(await this.downscale('cover', await fs.readFile(coverPath)));
    } else {
      notes.push('No cover.');
    }

    const pageCount = issue?.pageCount ?? 0;
    const first = Math.max(1, startPage);
    const last = Math.min(
      pageCount,
      first + Math.min(pages, VIEW_MAX_PAGES) - 1,
    );
    if (issue && pages > 0) {
      for (let page = first; page <= last; page++) {
        try {
          const rendered = await this.comicPageService.getPageImage(
            issue.id,
            page - 1,
            { maxWidth: VIEW_MAX_EDGE, maxHeight: VIEW_MAX_EDGE },
          );
          images.push({
            label: `page ${page}`,
            data: rendered.data,
            mimeType: rendered.mimeType,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'unknown';
          this.logger.warn(
            `view_item could not read page ${page} of ${issue.id}: ${reason}`,
          );
          // Archive and file-system errors can carry the absolute path, which
          // the agent must not see, so only HTTP errors keep their message.
          notes.push(
            error instanceof HttpException
              ? `Page ${page}: ${error.message}.`
              : 'The pages could not be read from the file.',
          );
          break;
        }
      }
    }
    if (!issue) notes.push('The series has no issues.');

    return {
      summary: {
        id,
        ...(issue && issue.id !== id ? { issueId: issue.id } : {}),
        pageCount,
        images: images.map((i) => i.label),
        ...(notes.length > 0 ? { notes } : {}),
      },
      images,
    };
  }

  private async firstIssue(
    seriesId: string,
  ): Promise<{ id: string; pageCount: number | null } | null> {
    const { comicBooks: books } = comicsSchema;
    const [row] = await this.db
      .select({ id: books.id, pageCount: books.pageCount })
      .from(books)
      .where(and(eq(books.seriesId, seriesId), ne(books.status, 'hidden')))
      .orderBy(
        sql`${books.sortNumber} ASC NULLS LAST`,
        asc(books.coverDate),
        asc(books.fileName),
      )
      .limit(1);
    return row ?? null;
  }

  /** Same fallback as the series page: the first issue that has a cover. */
  private async firstIssueCover(seriesId: string): Promise<string | null> {
    const { comicBooks: books } = comicsSchema;
    const [row] = await this.db
      .select({ id: books.id })
      .from(books)
      .where(
        and(
          eq(books.seriesId, seriesId),
          ne(books.status, 'hidden'),
          sql`${books.coverSource} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${books.sortNumber} ASC NULLS LAST`, asc(books.createdAt))
      .limit(1);
    return row ? this.comicsService.getBookCoverFilePath(row.id) : null;
  }

  private async downscale(label: string, data: Buffer): Promise<ViewImage> {
    const processed = await this.imageProcessing.processImage(data, {
      maxWidth: VIEW_MAX_EDGE,
      maxHeight: VIEW_MAX_EDGE,
      quality: VIEW_JPEG_QUALITY,
      format: 'jpeg',
    });
    return { label, data: processed.data, mimeType: processed.mimeType };
  }
}
