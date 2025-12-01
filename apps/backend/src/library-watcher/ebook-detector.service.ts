import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EbookUnit {
  path: string; // Full path to the EPUB file
  fileName: string;
}

const EBOOK_EXTENSIONS = ['.epub'];

function isEbookFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return EBOOK_EXTENSIONS.includes(ext);
}

@Injectable()
export class EbookDetectorService {
  private readonly logger = new Logger(EbookDetectorService.name);

  async detectEbookUnits(libraryPath: string): Promise<EbookUnit[]> {
    const units: EbookUnit[] = [];

    const scan = async (currentPath: string): Promise<void> => {
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        this.logger.warn(`Cannot read directory ${currentPath}: ${error}`);
        return;
      }

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.isFile() && isEbookFile(entry.name)) {
          units.push({
            path: entryPath,
            fileName: entry.name,
          });
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Recurse into subdirectories
          await scan(entryPath);
        }
      }
    };

    try {
      await scan(libraryPath);
    } catch (error) {
      this.logger.error(`Failed to scan library path ${libraryPath}: ${error}`);
      throw error;
    }

    return units;
  }

  async detectSingleUnit(filePath: string): Promise<EbookUnit | null> {
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
      this.logger.warn(`Failed to detect ebook unit at ${filePath}: ${error}`);
      return null;
    }
  }
}
