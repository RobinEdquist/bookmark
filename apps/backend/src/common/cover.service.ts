import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { ImageProcessingService } from './image-processing.service';
import {
  BlockedUrlError,
  ResponseTooLargeError,
  safeFetchUrl,
} from './safe-fetch.util';

const MAX_COVER_BYTES = 2 * 1024 * 1024;
const COVER_FETCH_TIMEOUT_MS = 15_000;

/**
 * Magic-byte sniff for the image formats the cover pipeline accepts. Keeps
 * arbitrary fetched content (HTML error pages, archives, ...) away from the
 * image decoder.
 */
function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG
  if (
    buffer.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'))
  ) {
    return true;
  }
  // GIF87a / GIF89a
  const gifHeader = buffer.subarray(0, 6).toString('latin1');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return true;
  }
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return true;
  }
  return false;
}

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
    // Fetch the image through the SSRF-hardened helper: http(s) only, no
    // private/loopback/metadata destinations (revalidated per redirect hop and
    // at connect time), body streamed with a hard byte cap and one deadline
    // covering the whole download.
    let response;
    try {
      response = await safeFetchUrl(url, {
        maxBytes: MAX_COVER_BYTES,
        timeoutMs: COVER_FETCH_TIMEOUT_MS,
        headers: { 'User-Agent': 'Bookmark/1.0' },
      });
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof ResponseTooLargeError) {
        throw new BadRequestException('Image size exceeds 2 MB limit');
      }
      throw new UnprocessableEntityException(
        `Failed to fetch image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new UnprocessableEntityException(
        `Failed to fetch image: HTTP ${response.status}`,
      );
    }

    // Validate content type
    if (!response.contentType || !response.contentType.startsWith('image/')) {
      throw new BadRequestException('URL does not point to an image');
    }

    // Verify magic bytes before handing the data to the image decoder
    if (!looksLikeImage(response.body)) {
      throw new BadRequestException(
        'URL does not point to a supported image (JPG, PNG, WebP, GIF)',
      );
    }

    return this.processAndSaveCover(response.body, config);
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
