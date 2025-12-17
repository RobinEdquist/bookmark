// apps/backend/src/library-watcher/media-detector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isAudioFile } from './utils/audio-file.utils';

export interface AudiobookUnit {
  type: 'single-file' | 'multi-file';
  path: string;
  files: string[];
}

export interface EbookUnit {
  path: string;
  fileName: string;
}

const EBOOK_EXTENSIONS = ['.epub'];

function isEbookFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return EBOOK_EXTENSIONS.includes(ext);
}

@Injectable()
export class MediaDetectorService {
  private readonly logger = new Logger(MediaDetectorService.name);

  // ===== AUDIOBOOK DETECTION =====

  async scanLibraryForAudiobooks(
    libraryPath: string,
  ): Promise<AudiobookUnit[]> {
    this.logger.log(
      `[SCAN] Starting audiobook scan of library: ${libraryPath}`,
    );
    const units: AudiobookUnit[] = [];

    const scan = async (currentPath: string): Promise<void> => {
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        this.logger.warn(
          `[SCAN] Cannot read directory ${currentPath}: ${error}`,
        );
        return;
      }

      const audioFiles = entries.filter(
        (e) => e.isFile() && isAudioFile(e.name),
      );
      const subdirs = entries.filter(
        (e) => e.isDirectory() && !e.name.startsWith('.'),
      );

      if (audioFiles.length > 0) {
        const files = audioFiles
          .map((f) => path.join(currentPath, f.name))
          .sort();

        const unit: AudiobookUnit = {
          type: files.length === 1 ? 'single-file' : 'multi-file',
          path: currentPath,
          files,
        };

        this.logger.debug(
          `[SCAN] Detected audiobook unit in subdirectory: ${JSON.stringify({
            type: unit.type,
            path: unit.path,
            filesCount: unit.files.length,
            firstFile: unit.files[0],
          })}`,
        );

        units.push(unit);
      } else {
        for (const subdir of subdirs) {
          await scan(path.join(currentPath, subdir.name));
        }
      }
    };

    try {
      const rootEntries = await fs.readdir(libraryPath, {
        withFileTypes: true,
      });

      for (const entry of rootEntries) {
        const entryPath = path.join(libraryPath, entry.name);

        if (entry.isFile() && isAudioFile(entry.name)) {
          const unit: AudiobookUnit = {
            type: 'single-file',
            path: entryPath,
            files: [entryPath],
          };

          this.logger.debug(
            `[SCAN] Detected root-level audiobook file: ${JSON.stringify({
              type: unit.type,
              path: unit.path,
              file: unit.files[0],
            })}`,
          );

          units.push(unit);
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(entryPath);
        }
      }
    } catch (error) {
      this.logger.error(
        `[SCAN] Failed to scan library path ${libraryPath}: ${error}`,
      );
      throw error;
    }

    this.logger.log(
      `[SCAN] Completed audiobook scan: found ${units.length} units`,
    );
    return units;
  }

  async detectAudiobook(filePath: string): Promise<AudiobookUnit | null> {
    try {
      const stats = await fs.stat(filePath);

      if (stats.isFile() && isAudioFile(filePath)) {
        return {
          type: 'single-file',
          path: filePath,
          files: [filePath],
        };
      }

      if (stats.isDirectory()) {
        const entries = await fs.readdir(filePath, { withFileTypes: true });
        const audioFiles = entries
          .filter((e) => e.isFile() && isAudioFile(e.name))
          .map((e) => path.join(filePath, e.name))
          .sort();

        if (audioFiles.length > 0) {
          return {
            type: audioFiles.length === 1 ? 'single-file' : 'multi-file',
            path: filePath,
            files: audioFiles,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to detect audiobook at ${filePath}: ${error}`);
      return null;
    }
  }

  // ===== EBOOK DETECTION =====

  async scanLibraryForEbooks(libraryPath: string): Promise<EbookUnit[]> {
    this.logger.log(`[SCAN] Starting ebook scan of library: ${libraryPath}`);
    const units: EbookUnit[] = [];

    const scan = async (currentPath: string): Promise<void> => {
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        this.logger.warn(
          `[SCAN] Cannot read directory ${currentPath}: ${error}`,
        );
        return;
      }

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.isFile() && isEbookFile(entry.name)) {
          const unit: EbookUnit = {
            path: entryPath,
            fileName: entry.name,
          };

          this.logger.debug(
            `[SCAN] Detected ebook: ${JSON.stringify({
              path: unit.path,
              fileName: unit.fileName,
              relativePath: path.relative(libraryPath, unit.path),
            })}`,
          );

          units.push(unit);
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(entryPath);
        }
      }
    };

    try {
      await scan(libraryPath);
    } catch (error) {
      this.logger.error(
        `[SCAN] Failed to scan library path ${libraryPath}: ${error}`,
      );
      throw error;
    }

    this.logger.log(`[SCAN] Completed ebook scan: found ${units.length} units`);
    return units;
  }

  async detectEbook(filePath: string): Promise<EbookUnit | null> {
    try {
      const stats = await fs.stat(filePath);

      if (stats.isFile() && isEbookFile(filePath)) {
        return {
          path: filePath,
          fileName: path.basename(filePath),
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to detect ebook at ${filePath}: ${error}`);
      return null;
    }
  }
}
