// apps/backend/src/library-watcher/metadata/comic-metadata.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  WorkerPoolService,
  getWorkerPath,
} from '../../common/worker-pool.service';
import { ParsedComicInfo } from '../utils/comicinfo.parser';

export interface ComicFileMetadata {
  comicInfo: ParsedComicInfo | null;
  pageCount: number;
  cover: { data: Buffer; mimeType: string } | null;
}

interface WorkerComicFileMetadata {
  comicInfo: ParsedComicInfo | null;
  pageCount: number;
  cover: { data: number[]; mimeType: string } | null;
}

const POOL_NAME = 'comic-metadata';

@Injectable()
export class ComicMetadataProvider implements OnModuleInit {
  private readonly logger = new Logger(ComicMetadataProvider.name);

  constructor(private readonly workerPool: WorkerPoolService) {}

  async onModuleInit(): Promise<void> {
    await this.workerPool.initializePool({
      name: POOL_NAME,
      workerScript: getWorkerPath(__dirname, 'comic-metadata.worker'),
      minWorkers: 2,
      maxWorkers: 4,
    });
  }

  /**
   * Extract metadata, page count and cover from a comic file.
   * THROWS on unreadable/corrupt files — callers record an import error
   * (quarantine) per the spec.
   */
  async extractMetadata(filePath: string): Promise<ComicFileMetadata> {
    const result = await this.workerPool.executeTask<WorkerComicFileMetadata>(
      POOL_NAME,
      'extractMetadata',
      { filePath },
    );

    return {
      comicInfo: result.comicInfo,
      pageCount: result.pageCount,
      cover: result.cover
        ? {
            data: Buffer.from(result.cover.data),
            mimeType: result.cover.mimeType,
          }
        : null,
    };
  }

  async extractCoverFromFile(
    filePath: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      const result = await this.workerPool.executeTask<{
        data: number[];
        mimeType: string;
      } | null>(POOL_NAME, 'extractCover', { filePath });

      if (!result) return null;
      return { data: Buffer.from(result.data), mimeType: result.mimeType };
    } catch (error) {
      this.logger.warn(
        `Cover extraction failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Extract a single page image (zero-based index) from a comic file.
   * Returns raw page bytes (JPEG/PNG/etc); callers normalize/resize.
   * Returns null if the page is out of range or extraction fails.
   */
  async extractPage(
    filePath: string,
    pageIndex: number,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    this.logger.log(
      `[comic-extract] extractPage filePath=${filePath} pageIndex=${pageIndex}`,
    );
    try {
      const result = await this.workerPool.executeTask<{
        data: number[];
        mimeType: string;
      } | null>(POOL_NAME, 'extractPage', { filePath, pageIndex });
      if (!result) {
        this.logger.warn(
          `[comic-extract] extractPage null result (out-of-range or empty) filePath=${filePath} pageIndex=${pageIndex}`,
        );
        return null;
      }
      this.logger.log(
        `[comic-extract] extractPage success filePath=${filePath} pageIndex=${pageIndex} mimeType=${result.mimeType} bytes=${result.data.length}`,
      );
      return { data: Buffer.from(result.data), mimeType: result.mimeType };
    } catch (error) {
      this.logger.warn(
        `[comic-extract] extractPage failed filePath=${filePath} pageIndex=${pageIndex}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
}
