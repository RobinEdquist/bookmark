import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DirectoryInfo {
  name: string;
  path: string;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryInfo[];
}

@Injectable()
export class FilesystemService {
  async browse(dirPath: string): Promise<BrowseResult> {
    const normalizedPath = path.resolve(dirPath);

    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw new BadRequestException('Path is not a directory');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Path does not exist or is not accessible');
    }

    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });

    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = normalizedPath === '/' ? null : path.dirname(normalizedPath);

    return {
      currentPath: normalizedPath,
      parentPath,
      directories,
    };
  }

  async createDirectory(dirPath: string): Promise<DirectoryInfo> {
    const normalizedPath = path.resolve(dirPath);
    const dirName = path.basename(normalizedPath);

    // Validate directory name
    if (!dirName || dirName.startsWith('.')) {
      throw new BadRequestException('Invalid directory name');
    }
    if (dirName.includes('/') || dirName.includes('\\')) {
      throw new BadRequestException('Directory name cannot contain path separators');
    }

    try {
      await fs.mkdir(normalizedPath);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'EEXIST') {
          throw new BadRequestException('Directory already exists');
        }
        if (nodeError.code === 'ENOENT') {
          throw new BadRequestException('Parent directory does not exist');
        }
        if (nodeError.code === 'EACCES') {
          throw new BadRequestException('Permission denied');
        }
      }
      throw new BadRequestException('Failed to create directory');
    }

    return {
      name: dirName,
      path: normalizedPath,
    };
  }

  async getInitialPath(): Promise<string> {
    // Try /data first (standard Docker mount point)
    try {
      await fs.access('/data', fs.constants.R_OK);
      return '/data';
    } catch {
      // Fall back to root
      return '/';
    }
  }
}
