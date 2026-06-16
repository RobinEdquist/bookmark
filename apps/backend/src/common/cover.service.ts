import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { ImageProcessingService } from './image-processing.service';

/**
 * Configuration for cover operations.
 */
export interface CoverOperationConfig {
  /** The entity ID */
  entityId: string;
  /** The API path for the cover URL (e.g., 'audiobooks' or 'ebooks') */
  apiPath: string;
  /** Function to get the cover storage path */
  getCoverPath: (id: string) => string;
  /** Function to verify the entity exists (throws if not found) */
  verifyExists: (id: string) => Promise<void>;
  /** Function to update the entity's cover metadata in the database */
  updateCoverMetadata: (id: string, coverUrl: string) => Promise<void>;
  /** Function to emit an update event */
  emitUpdateEvent: (id: string) => void;
}

/**
 * Shared service for cover image operations.
 * Handles common logic for uploading and processing covers for both audiobooks and ebooks.
 */
@Injectable()
export class CoverService {
  constructor(private readonly imageProcessing: ImageProcessingService) {}

  /**
   * Update cover from a file buffer.
   */
  async updateCoverFromFile(
    buffer: Buffer,
    config: CoverOperationConfig,
  ): Promise<{ coverUrl: string }> {
    return this.processAndSaveCover(buffer, config);
  }

  /**
   * Update cover from a URL.
   * Fetches the image, validates it, and processes it.
   */
  async updateCoverFromUrl(
    url: string,
    config: CoverOperationConfig,
  ): Promise<{ coverUrl: string }> {
    // Fetch the image from URL
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Bookmark/1.0',
        },
      });
    } catch (error) {
      throw new UnprocessableEntityException(
        `Failed to fetch image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new UnprocessableEntityException(
        `Failed to fetch image: HTTP ${response.status}`,
      );
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new BadRequestException('URL does not point to an image');
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 2 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds 2 MB limit');
    }

    // Read the response body
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Double-check size after download
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds 2 MB limit');
    }

    return this.processAndSaveCover(buffer, config);
  }

  /**
   * Process and save a cover image.
   * Verifies the entity exists, processes the image, saves it, and updates metadata.
   */
  private async processAndSaveCover(
    buffer: Buffer,
    config: CoverOperationConfig,
  ): Promise<{ coverUrl: string }> {
    // Verify entity exists (will throw NotFoundException if not)
    await config.verifyExists(config.entityId);

    // Process image in worker thread
    let processedBuffer: Buffer;
    try {
      processedBuffer = await this.imageProcessing.processCover(buffer);
    } catch {
      throw new BadRequestException('Invalid image file');
    }

    // Save cover to app data directory
    const coverPath = config.getCoverPath(config.entityId);
    await fs.writeFile(coverPath, processedBuffer);

    // Update database
    const coverUrl = `${config.entityId}.jpg`;
    await config.updateCoverMetadata(config.entityId, coverUrl);

    // Emit update event
    config.emitUpdateEvent(config.entityId);

    return { coverUrl: `/api/${config.apiPath}/${config.entityId}/cover` };
  }

  /**
   * Generate a cover URL for an entity.
   * Returns null if no cover exists.
   */
  getCoverUrl(
    entityId: string,
    coverUrl: string | null,
    coverSource: string | null,
    apiPath: string,
  ): string | null {
    if (coverSource || coverUrl) {
      return `/api/${apiPath}/${entityId}/cover`;
    }
    return null;
  }
}
