// apps/backend/src/library-watcher/metadata/embedded-metadata.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MetadataWorkerPoolService } from './metadata-worker-pool.service';

export interface ExtractedMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  narrator?: string;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string;
  genres?: string[];
  series?: string;
  seriesOrder?: string;
  hasEmbeddedCover?: boolean;
  duration?: number;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
}

export interface AudioFileInfo {
  filePath: string;
  fileName: string;
  duration: number;
  format: string;
  bitrate?: number;
  sampleRate?: number;
  sizeBytes: number;
}

export interface FullMetadataResult {
  metadata: ExtractedMetadata;
  fileInfo: AudioFileInfo;
  chapters: Array<{ title: string; startTime: number; endTime?: number }>;
}

@Injectable()
export class EmbeddedMetadataProvider {
  private readonly logger = new Logger(EmbeddedMetadataProvider.name);

  constructor(private readonly workerPool: MetadataWorkerPoolService) {}

  async extractMetadata(filePath: string): Promise<ExtractedMetadata> {
    try {
      // Use worker thread to avoid blocking main event loop
      const result = await this.workerPool.extractFullMetadata(filePath);
      return result.metadata;
    } catch (error) {
      this.logger.error(
        `Failed to extract metadata from ${filePath}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Extract all metadata, file info, and chapters from a single file in one pass.
   * Uses worker thread to avoid blocking main event loop.
   */
  async extractFullMetadata(filePath: string): Promise<FullMetadataResult> {
    try {
      // Use worker thread to avoid blocking main event loop
      return await this.workerPool.extractFullMetadata(filePath);
    } catch (error) {
      this.logger.error(
        `Failed to extract full metadata from ${filePath}: ${error}`,
      );
      throw error;
    }
  }

  async getFileInfo(filePath: string): Promise<AudioFileInfo> {
    try {
      // Use worker thread to avoid blocking main event loop
      return await this.workerPool.getFileInfo(filePath);
    } catch (error) {
      this.logger.error(`Failed to get file info from ${filePath}: ${error}`);
      throw error;
    }
  }

  async extractChapters(
    filePath: string,
  ): Promise<Array<{ title: string; startTime: number; endTime?: number }>> {
    try {
      // Use extractFullMetadata which runs in worker thread
      const result = await this.workerPool.extractFullMetadata(filePath);
      return result.chapters;
    } catch (error) {
      this.logger.warn(`Failed to extract chapters from ${filePath}: ${error}`);
      return [];
    }
  }

  async extractCover(
    filePath: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      // Use worker thread to avoid blocking main event loop
      const result = await this.workerPool.extractCover(filePath);
      if (!result) {
        return null;
      }
      return {
        data: Buffer.from(result.data),
        mimeType: result.mimeType,
      };
    } catch (error) {
      this.logger.warn(`Failed to extract cover from ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Find a cover image file in the given folder
   * Returns the full path to the first image file found, or null if none
   */
  async findCoverInFolder(folderPath: string): Promise<string | null> {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    try {
      const files = await fs.readdir(folderPath);
      const imageFile = files.find((file) =>
        imageExtensions.includes(path.extname(file).toLowerCase()),
      );

      if (imageFile) {
        this.logger.debug(`Found cover image in folder: ${imageFile}`);
        return path.join(folderPath, imageFile);
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to scan folder for cover image: ${error}`);
      return null;
    }
  }
}
