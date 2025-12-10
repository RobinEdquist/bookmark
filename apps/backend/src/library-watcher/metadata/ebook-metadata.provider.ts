import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import EPub from 'epub2';

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

@Injectable()
export class EbookMetadataProvider {
  private readonly logger = new Logger(EbookMetadataProvider.name);

  async extractMetadata(filePath: string): Promise<EbookMetadata> {
    try {
      const epub = await EPub.createAsync(filePath);
      const metadata = epub.metadata;

      // Extract title - may have subtitle after a colon or dash
      let title =
        metadata.title || path.basename(filePath, path.extname(filePath));
      let subtitle: string | undefined;

      // Try to extract subtitle from title
      const colonIndex = title.indexOf(':');
      const dashIndex = title.indexOf(' - ');
      if (colonIndex > 0) {
        subtitle = title.substring(colonIndex + 1).trim();
        title = title.substring(0, colonIndex).trim();
      } else if (dashIndex > 0) {
        subtitle = title.substring(dashIndex + 3).trim();
        title = title.substring(0, dashIndex).trim();
      }

      // Extract authors - may be comma-separated or in an array
      let authors: string[] = [];
      if (metadata.creator) {
        if (typeof metadata.creator === 'string') {
          authors = metadata.creator
            .split(/[,&]/)
            .map((a: string) => a.trim())
            .filter(Boolean);
        } else if (Array.isArray(metadata.creator)) {
          authors = metadata.creator
            .map((a: string) => a.trim())
            .filter(Boolean);
        }
      }

      // Extract cover
      let cover: { data: Buffer; mimeType: string } | undefined;
      try {
        cover = await this.extractCover(epub);
      } catch (error) {
        this.logger.debug(`No cover found for ${filePath}: ${error}`);
      }

      // Extract ISBN from identifiers
      let isbn: string | undefined;
      if (metadata.ISBN) {
        isbn = metadata.ISBN;
      } else if (metadata.identifier) {
        // Try to extract ISBN from identifier
        const identifier = metadata.identifier;
        if (
          typeof identifier === 'string' &&
          identifier.match(/^(97[89])?\d{9}[\dXx]$/)
        ) {
          isbn = identifier;
        }
      }

      return {
        title,
        subtitle,
        description: this.cleanDescription(metadata.description),
        authors,
        publisher: metadata.publisher,
        publishedDate: metadata.date,
        language: metadata.language,
        isbn,
        cover,
      };
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

  private async extractCover(
    epub: EPub,
  ): Promise<{ data: Buffer; mimeType: string } | undefined> {
    return new Promise((resolve, reject) => {
      // Try to get cover from manifest
      const coverId = epub.metadata.cover;
      if (!coverId) {
        // Try common cover IDs
        const manifest = epub.manifest;
        const possibleCoverIds = [
          'cover',
          'cover-image',
          'coverimage',
          'cover_image',
        ];
        let foundId: string | undefined;

        for (const id of possibleCoverIds) {
          if (manifest[id]) {
            foundId = id;
            break;
          }
        }

        // Also try to find by media-type
        if (!foundId) {
          for (const [id, item] of Object.entries(manifest)) {
            const itemObj = item as { 'media-type'?: string; href?: string };
            if (
              itemObj['media-type']?.startsWith('image/') &&
              (id.toLowerCase().includes('cover') ||
                itemObj.href?.toLowerCase().includes('cover'))
            ) {
              foundId = id;
              break;
            }
          }
        }

        if (!foundId) {
          reject(new Error('No cover found'));
          return;
        }

        epub.getImage(foundId, (error, data, mimeType) => {
          if (error || !data) {
            reject(error || new Error('No cover data'));
            return;
          }
          resolve({ data, mimeType: mimeType || 'image/jpeg' });
        });
      } else {
        epub.getImage(coverId, (error, data, mimeType) => {
          if (error || !data) {
            reject(error || new Error('No cover data'));
            return;
          }
          resolve({ data, mimeType: mimeType || 'image/jpeg' });
        });
      }
    });
  }

  async extractCoverFromFile(
    filePath: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      const epub = await EPub.createAsync(filePath);
      const cover = await this.extractCover(epub);
      return cover ?? null;
    } catch {
      return null;
    }
  }

  private cleanDescription(description?: string): string | undefined {
    if (!description) return undefined;

    // Remove HTML tags
    let cleaned = description.replace(/<[^>]*>/g, '');
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || undefined;
  }
}
