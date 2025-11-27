// apps/backend/src/library-watcher/audiobook-detector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isAudioFile } from './utils/audio-file.utils';

export interface AudiobookUnit {
  type: 'single-file' | 'multi-file';
  path: string;
  files: string[];
}

@Injectable()
export class AudiobookDetectorService {
  private readonly logger = new Logger(AudiobookDetectorService.name);

  async detectAudiobookUnits(libraryPath: string): Promise<AudiobookUnit[]> {
    const units: AudiobookUnit[] = [];

    const scan = async (currentPath: string): Promise<void> => {
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        this.logger.warn(`Cannot read directory ${currentPath}: ${error}`);
        return;
      }

      const audioFiles = entries.filter((e) => e.isFile() && isAudioFile(e.name));
      const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

      if (audioFiles.length > 0) {
        // This folder contains audio files - it's an audiobook unit
        const files = audioFiles
          .map((f) => path.join(currentPath, f.name))
          .sort(); // Sort for consistent ordering

        units.push({
          type: files.length === 1 ? 'single-file' : 'multi-file',
          path: currentPath,
          files,
        });
        // Don't recurse into subdirs - this folder is the audiobook
      } else {
        // No audio files here - recurse into subdirectories
        for (const subdir of subdirs) {
          await scan(path.join(currentPath, subdir.name));
        }
      }
    };

    // Check for single audio files directly in the library root
    try {
      const rootEntries = await fs.readdir(libraryPath, { withFileTypes: true });

      for (const entry of rootEntries) {
        const entryPath = path.join(libraryPath, entry.name);

        if (entry.isFile() && isAudioFile(entry.name)) {
          units.push({
            type: 'single-file',
            path: entryPath,
            files: [entryPath],
          });
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(entryPath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to scan library path ${libraryPath}: ${error}`);
      throw error;
    }

    return units;
  }

  async detectSingleUnit(filePath: string): Promise<AudiobookUnit | null> {
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
      this.logger.warn(`Failed to detect audiobook unit at ${filePath}: ${error}`);
      return null;
    }
  }

  determineAudiobookRoot(filePath: string): string {
    // For a file, check if its parent directory contains multiple audio files
    // If so, the parent is the audiobook root; otherwise, the file itself is
    const parentDir = path.dirname(filePath);
    return parentDir;
  }
}
