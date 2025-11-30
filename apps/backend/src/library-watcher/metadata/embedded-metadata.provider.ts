// apps/backend/src/library-watcher/metadata/embedded-metadata.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import * as mm from 'music-metadata';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

@Injectable()
export class EmbeddedMetadataProvider {
  private readonly logger = new Logger(EmbeddedMetadataProvider.name);

  async extractMetadata(filePath: string): Promise<ExtractedMetadata> {
    try {
      const metadata = await mm.parseFile(filePath);
      const { common, format } = metadata;

      const result: ExtractedMetadata = {
        title: common.title || undefined,
        subtitle: common.subtitle?.[0] || undefined,
        author: common.artist || common.albumartist || undefined,
        narrator: common.composer?.[0] || undefined,
        description: common.comment?.[0]?.text || undefined,
        publisher: common.label?.[0] || undefined,
        publishedDate: common.year?.toString() || undefined,
        language: common.language || undefined,
        genres: common.genre || undefined,
        series: common.grouping || undefined,
        hasEmbeddedCover: common.picture && common.picture.length > 0,
        duration: format.duration ? Math.round(format.duration) : undefined,
        format: format.container || undefined,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
        sampleRate: format.sampleRate || undefined,
      };

      return result;
    } catch (error) {
      this.logger.error(`Failed to extract metadata from ${filePath}: ${error}`);
      throw error;
    }
  }

  async getFileInfo(filePath: string): Promise<AudioFileInfo> {
    const metadata = await mm.parseFile(filePath);
    const stats = await fs.stat(filePath);

    return {
      filePath,
      fileName: path.basename(filePath),
      duration: metadata.format.duration ? Math.round(metadata.format.duration) : 0,
      format: metadata.format.container || path.extname(filePath).slice(1),
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
      sampleRate: metadata.format.sampleRate || undefined,
      sizeBytes: stats.size,
    };
  }

  async extractChapters(filePath: string): Promise<Array<{ title: string; startTime: number; endTime?: number }>> {
    try {
      // Parse with includeChapters: true for M4B/MP4 chapter support
      const metadata = await mm.parseFile(filePath, { includeChapters: true });
      const sampleRate = metadata.format.sampleRate || 44100;

      // Check format.chapters (works for M4B/M4A/MP4 files with chapter tracks)
      if (metadata.format.chapters && metadata.format.chapters.length > 0) {
        this.logger.debug(`Found ${metadata.format.chapters.length} chapters via format.chapters`);
        return metadata.format.chapters.map((chap, index: number) => ({
          title: chap.title || `Chapter ${index + 1}`,
          // Convert sampleOffset to seconds
          startTime: Math.round(chap.sampleOffset / sampleRate),
          endTime: undefined, // format.chapters doesn't have endTime, it's implicit from next chapter
        }));
      }

      // Try ID3v2.4 CHAP tags (for MP3 files with chapters)
      const id3Chapters = metadata.native?.['ID3v2.4']?.filter((tag) => tag.id === 'CHAP') || [];
      if (id3Chapters.length > 0) {
        this.logger.debug(`Found ${id3Chapters.length} chapters via ID3v2.4 CHAP tags`);
        return id3Chapters.map((chap, index: number) => {
          const value = chap.value as { startTime: number; endTime?: number; title?: string };
          return {
            title: value.title || `Chapter ${index + 1}`,
            startTime: Math.round(value.startTime / 1000), // Convert ms to seconds
            endTime: value.endTime ? Math.round(value.endTime / 1000) : undefined,
          };
        });
      }

      // Fallback: Try ffprobe for M4B/M4A files (handles more chapter formats)
      const ext = path.extname(filePath).toLowerCase();
      if (['.m4b', '.m4a', '.mp4'].includes(ext)) {
        const ffprobeChapters = await this.extractChaptersWithFfprobe(filePath);
        if (ffprobeChapters.length > 0) {
          return ffprobeChapters;
        }
      }

      this.logger.debug(`No chapters found in ${path.basename(filePath)}`);
      return [];
    } catch (error) {
      this.logger.warn(`Failed to extract chapters from ${filePath}: ${error}`);
      return [];
    }
  }

  private async extractChaptersWithFfprobe(filePath: string): Promise<Array<{ title: string; startTime: number; endTime?: number }>> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_chapters "${filePath.replace(/"/g, '\\"')}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large files
      );

      const data = JSON.parse(stdout);

      if (!data.chapters || data.chapters.length === 0) {
        this.logger.debug(`ffprobe found no chapters in ${path.basename(filePath)}`);
        return [];
      }

      this.logger.debug(`Found ${data.chapters.length} chapters via ffprobe`);

      return data.chapters.map((chap: { start_time?: string; end_time?: string; tags?: { title?: string } }, index: number) => ({
        title: chap.tags?.title || `Chapter ${index + 1}`,
        startTime: Math.round(parseFloat(chap.start_time || '0')),
        endTime: chap.end_time ? Math.round(parseFloat(chap.end_time)) : undefined,
      }));
    } catch (error) {
      // ffprobe not installed or failed - this is expected on some systems
      this.logger.debug(`ffprobe chapter extraction failed for ${path.basename(filePath)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  async extractCover(filePath: string): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      const metadata = await mm.parseFile(filePath);
      const picture = metadata.common.picture?.[0];

      if (!picture) {
        return null;
      }

      return {
        data: Buffer.from(picture.data),
        mimeType: picture.format || 'image/jpeg',
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
