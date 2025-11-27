// apps/backend/src/library-watcher/metadata/embedded-metadata.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import * as mm from 'music-metadata';
import * as fs from 'fs/promises';
import * as path from 'path';

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
      const metadata = await mm.parseFile(filePath);
      const chapters = metadata.native?.['ID3v2.4']?.filter((tag) => tag.id === 'CHAP') || [];

      if (chapters.length === 0) {
        // Try M4B chapter format
        const m4bChapters = metadata.native?.['iTunes']?.filter((tag) => tag.id === '----:com.apple.iTunes:CHAPTER') || [];
        // M4B chapter parsing would go here - simplified for now
        if (m4bChapters.length > 0) {
          this.logger.debug(`Found ${m4bChapters.length} M4B chapters (parsing not yet implemented)`);
        }
        return [];
      }

      return chapters.map((chap, index: number) => {
        const value = chap.value as { startTime: number; endTime?: number; title?: string };
        return {
          title: value.title || `Chapter ${index + 1}`,
          startTime: Math.round(value.startTime / 1000), // Convert ms to seconds
          endTime: value.endTime ? Math.round(value.endTime / 1000) : undefined,
        };
      });
    } catch (error) {
      this.logger.warn(`Failed to extract chapters from ${filePath}: ${error}`);
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
}
