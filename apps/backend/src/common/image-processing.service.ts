import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import * as path from 'path';
import {
  bytesToBuffer,
  copyToTransferableBytes,
} from './utils/worker-bytes.util';

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

const POOL_NAME = 'image-processing';

@Injectable()
export class ImageProcessingService implements OnModuleInit {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(private readonly workerPool: WorkerPoolService) {}

  async onModuleInit(): Promise<void> {
    // Get the worker path - the worker is in library-watcher/metadata
    const workerPath = path.join(
      __dirname,
      '..',
      'library-watcher',
      'metadata',
      'image.worker.js',
    );

    await this.workerPool.initializePool({
      name: POOL_NAME,
      workerScript: workerPath,
      minWorkers: 2,
      maxWorkers: 4, // Image processing is memory-intensive, limit workers
    });
  }

  /**
   * Process an image buffer: resize and convert format.
   * Runs in a worker thread to avoid blocking the main event loop.
   */
  async processImage(
    imageBuffer: Buffer,
    options: ProcessImageOptions = {},
  ): Promise<{ data: Buffer; mimeType: string }> {
    const {
      maxWidth = 1000,
      maxHeight = 1000,
      quality = 85,
      format = 'jpeg',
    } = options;

    try {
      // Copy into a dedicated backing store so transferring it cannot detach
      // the caller's Buffer (which may share Node's pooled allocation slab).
      const imageData = copyToTransferableBytes(imageBuffer);
      const result = await this.workerPool.executeTask<{
        data: Uint8Array;
        mimeType: string;
      }>(
        POOL_NAME,
        'processImage',
        {
          imageData,
          options: {
            maxWidth,
            maxHeight,
            quality,
            format,
          },
        },
        [imageData.buffer],
      );

      return {
        data: bytesToBuffer(result.data),
        mimeType: result.mimeType,
      };
    } catch (error) {
      this.logger.error(`Failed to process image: ${error}`);
      throw error;
    }
  }

  /**
   * Process and save a cover image with standard settings.
   * Convenience method for common cover processing use case.
   */
  async processCover(imageBuffer: Buffer): Promise<Buffer> {
    const result = await this.processImage(imageBuffer, {
      maxWidth: 1000,
      maxHeight: 1000,
      quality: 85,
      format: 'jpeg',
    });
    return result.data;
  }
}
