// apps/backend/src/library-watcher/metadata/ebook-metadata.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import {
  WorkerPoolService,
  getWorkerPath,
} from '../../common/worker-pool.service';

export interface EbookMetadata {
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  pageCount?: number;
  cover?: {
    data: Buffer;
    mimeType: string;
  };
}

interface WorkerEbookMetadata {
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  pageCount?: number;
  cover?: {
    data: number[];
    mimeType: string;
  };
}

const POOL_NAME = 'ebook-metadata';

@Injectable()
export class EbookMetadataProvider implements OnModuleInit {
  private readonly logger = new Logger(EbookMetadataProvider.name);

  constructor(private readonly workerPool: WorkerPoolService) {}

  async onModuleInit(): Promise<void> {
    await this.workerPool.initializePool({
      name: POOL_NAME,
      workerScript: getWorkerPath(__dirname, 'ebook-metadata.worker'),
      minWorkers: 2,
      maxWorkers: 4, // Ebooks are typically smaller, fewer workers needed
    });
  }

  async extractMetadata(filePath: string): Promise<EbookMetadata> {
    try {
      const result = await this.workerPool.executeTask<WorkerEbookMetadata>(
        POOL_NAME,
        'extractMetadata',
        { filePath },
      );

      // Convert cover data array back to Buffer
      if (result.cover) {
        return {
          ...result,
          cover: {
            data: Buffer.from(result.cover.data),
            mimeType: result.cover.mimeType,
          },
        };
      }

      return result as EbookMetadata;
    } catch (error) {
      this.logger.error(
        `Failed to extract metadata from ${filePath}: ${error}`,
      );
      // Return minimal metadata based on filename
      const fileName = path.basename(filePath, path.extname(filePath));
      return {
        title: fileName,
        authors: [],
      };
    }
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

      return {
        data: Buffer.from(result.data),
        mimeType: result.mimeType,
      };
    } catch {
      return null;
    }
  }
}
