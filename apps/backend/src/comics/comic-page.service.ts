import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppDataService } from '../app-data/app-data.service';
import { ComicMetadataProvider } from '../library-watcher/metadata/comic-metadata.provider';
import { ImageProcessingService } from '../common/image-processing.service';
import * as schema from './schema';

export interface PageRenderOptions {
  maxWidth?: number;
  maxHeight?: number;
}

// Default ceiling when the client does not request a size. High enough to
// preserve quality on retina tablets, capped to avoid huge buffers.
const DEFAULT_MAX_DIMENSION = 4096;
const PAGE_JPEG_QUALITY = 90;
// Size cap for the on-disk page cache; oldest files are pruned past this.
const PAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

@Injectable()
export class ComicPageService {
  private readonly logger = new Logger(ComicPageService.name);
  private pruning = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly appSettings: AppSettingsService,
    private readonly appData: AppDataService,
    private readonly comicMetadataProvider: ComicMetadataProvider,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  private async getBook(bookId: string) {
    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, bookId))
      .limit(1);
    if (!book) {
      this.logger.warn(`[comic-page] getBook not found bookId=${bookId}`);
      throw new NotFoundException('Comic book not found');
    }
    return book;
  }

  private variantKey(options: PageRenderOptions): string {
    const w = options.maxWidth ?? 'o';
    const h = options.maxHeight ?? 'o';
    return `${w}x${h}`;
  }

  /**
   * Return a single comic page as a normalized JPEG, served from a disk cache
   * when available. `pageIndex` is zero-based.
   */
  async getPageImage(
    bookId: string,
    pageIndex: number,
    options: PageRenderOptions,
  ): Promise<{ data: Buffer; mimeType: string; pageCount: number }> {
    const startMs = Date.now();
    this.logger.log(
      `[comic-page] getPageImage entry bookId=${bookId} pageIndex=${pageIndex} maxWidth=${options.maxWidth ?? 'unset'} maxHeight=${options.maxHeight ?? 'unset'}`,
    );

    const book = await this.getBook(bookId);
    const pageCount = book.pageCount ?? 0;
    if (pageIndex < 0 || pageIndex >= pageCount) {
      this.logger.warn(
        `[comic-page] getPageImage out-of-range bookId=${bookId} pageIndex=${pageIndex} pageCount=${pageCount}`,
      );
      throw new NotFoundException('Page not found');
    }

    const variant = this.variantKey(options);
    const cachePath = this.appData.getComicPageCachePath(
      bookId,
      pageIndex,
      variant,
    );
    this.logger.log(
      `[comic-page] getPageImage cachePath=${cachePath} variant=${variant}`,
    );

    // Cache hit
    try {
      const cached = await fs.readFile(cachePath);
      if (cached.length > 0) {
        this.logger.log(
          `[comic-page] getPageImage cacheHit=true bookId=${bookId} pageIndex=${pageIndex} bytes=${cached.length} ms=${Date.now() - startMs}`,
        );
        return { data: cached, mimeType: 'image/jpeg', pageCount };
      }
      // zero-byte/partial file — treat as miss, fall through to re-extract
      this.logger.warn(
        `[comic-page] getPageImage cache zero-byte file, treating as miss cachePath=${cachePath}`,
      );
    } catch {
      // miss — fall through
      this.logger.log(
        `[comic-page] getPageImage cacheHit=false bookId=${bookId} pageIndex=${pageIndex}`,
      );
    }

    // Extract raw page
    const libraryPath = await this.appSettings.getComicLibraryPath();
    if (!libraryPath) {
      throw new Error('Comic library path not configured');
    }
    const absolute = path.join(libraryPath, book.filePath);
    this.logger.log(
      `[comic-page] getPageImage extracting bookId=${bookId} pageIndex=${pageIndex} filePath=${absolute} container=${book.container}`,
    );
    const raw = await this.comicMetadataProvider.extractPage(
      absolute,
      pageIndex,
    );
    if (!raw) {
      this.logger.warn(
        `[comic-page] getPageImage extractPage returned null bookId=${bookId} pageIndex=${pageIndex} pageCount=${pageCount}`,
      );
      throw new NotFoundException('Page not found');
    }
    this.logger.log(
      `[comic-page] getPageImage extracted bookId=${bookId} pageIndex=${pageIndex} rawBytes=${raw.data.length} mimeType=${raw.mimeType}`,
    );

    // Normalize to JPEG (+ optional resize)
    const processed = await this.imageProcessing.processImage(raw.data, {
      maxWidth: options.maxWidth ?? DEFAULT_MAX_DIMENSION,
      maxHeight: options.maxHeight ?? DEFAULT_MAX_DIMENSION,
      quality: PAGE_JPEG_QUALITY,
      format: 'jpeg',
    });
    this.logger.log(
      `[comic-page] getPageImage processed bookId=${bookId} pageIndex=${pageIndex} processedBytes=${processed.data.length} ms=${Date.now() - startMs}`,
    );

    // Write to cache (best-effort)
    try {
      await fs.mkdir(this.appData.getComicPageCacheDir(bookId), {
        recursive: true,
      });
      await fs.writeFile(cachePath, processed.data);
      void this.pruneCacheIfNeeded();
    } catch (error) {
      this.logger.warn(`Failed to cache comic page ${cachePath}: ${error}`);
    }

    this.logger.log(
      `[comic-page] getPageImage done bookId=${bookId} pageIndex=${pageIndex} bytes=${processed.data.length} ms=${Date.now() - startMs}`,
    );
    return { data: processed.data, mimeType: 'image/jpeg', pageCount };
  }

  /**
   * Best-effort LRU-ish prune: if the cache exceeds the size cap, delete the
   * oldest files (by mtime) until back under 80% of the cap.
   */
  private async pruneCacheIfNeeded(): Promise<void> {
    if (this.pruning) return;
    this.pruning = true;
    try {
      const base = this.appData.getComicPageCacheBasePath();
      const entries: Array<{ file: string; size: number; mtimeMs: number }> =
        [];
      try {
        const bookDirs = await fs.readdir(base, { withFileTypes: true });
        for (const dir of bookDirs) {
          if (!dir.isDirectory()) continue;
          const dirPath = path.join(base, dir.name);
          const files = await fs.readdir(dirPath);
          for (const f of files) {
            const full = path.join(dirPath, f);
            try {
              const st = await fs.stat(full);
              entries.push({ file: full, size: st.size, mtimeMs: st.mtimeMs });
            } catch {
              // ignore unreadable entries
            }
          }
        }
      } catch {
        return;
      }

      let total = entries.reduce((sum, e) => sum + e.size, 0);
      if (total <= PAGE_CACHE_MAX_BYTES) return;

      entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
      const target = PAGE_CACHE_MAX_BYTES * 0.8;
      for (const e of entries) {
        if (total <= target) break;
        try {
          await fs.unlink(e.file);
          total -= e.size;
        } catch {
          // ignore
        }
      }
    } finally {
      this.pruning = false;
    }
  }
}
