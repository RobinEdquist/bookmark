// apps/backend/src/library-watcher/import-queue.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AudiobookDetectorService } from './audiobook-detector.service';
import { AudiobookImporterService } from './audiobook-importer.service';
import { isAudioFile } from './utils/audio-file.utils';

interface PendingImport {
  path: string;
  firstSeen: Date;
  lastActivity: Date;
  files: Set<string>;
  status: 'collecting' | 'stable' | 'processing';
}

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportQueueService.name);
  private pendingImports = new Map<string, PendingImport>();
  private checkInterval: NodeJS.Timeout | null = null;

  private readonly STABILITY_THRESHOLD_MS = 3000; // 3 seconds of quiet
  private readonly MAX_WAIT_MS = 60000; // Max 1 minute wait
  private readonly FILE_STABLE_CHECK_MS = 500; // Time between size checks

  constructor(
    private audiobookDetector: AudiobookDetectorService,
    private audiobookImporter: AudiobookImporterService,
  ) {
    this.startProcessing();
  }

  onModuleDestroy() {
    this.stopProcessing();
  }

  private startProcessing(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.processStableImports(), 1000);
  }

  private stopProcessing(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  queueFile(filePath: string): void {
    if (!isAudioFile(filePath)) {
      return;
    }

    const audiobookRoot = this.determineAudiobookRoot(filePath);
    this.addToPending(audiobookRoot, filePath);
  }

  queueDirectory(dirPath: string): void {
    this.addToPending(dirPath, dirPath);
  }

  private addToPending(audiobookRoot: string, filePath: string): void {
    const existing = this.pendingImports.get(audiobookRoot);

    if (existing && existing.status === 'collecting') {
      existing.lastActivity = new Date();
      existing.files.add(filePath);
      this.logger.debug(`Updated pending import: ${audiobookRoot} (${existing.files.size} files)`);
    } else if (!existing) {
      this.pendingImports.set(audiobookRoot, {
        path: audiobookRoot,
        firstSeen: new Date(),
        lastActivity: new Date(),
        files: new Set([filePath]),
        status: 'collecting',
      });
      this.logger.debug(`New pending import: ${audiobookRoot}`);
    }
  }

  private determineAudiobookRoot(filePath: string): string {
    // The parent directory is the audiobook root for multi-file audiobooks
    // For single files, we'll detect this during processing
    return path.dirname(filePath);
  }

  private async processStableImports(): Promise<void> {
    const now = Date.now();

    for (const [rootPath, pending] of this.pendingImports) {
      if (pending.status !== 'collecting') continue;

      const timeSinceLastActivity = now - pending.lastActivity.getTime();
      const totalWaitTime = now - pending.firstSeen.getTime();

      if (
        timeSinceLastActivity >= this.STABILITY_THRESHOLD_MS ||
        totalWaitTime >= this.MAX_WAIT_MS
      ) {
        await this.processImport(pending);
      }
    }
  }

  private async processImport(pending: PendingImport): Promise<void> {
    pending.status = 'processing';
    this.logger.log(`Processing import: ${pending.path}`);

    try {
      // Verify all files are fully written
      const allStable = await this.verifyFilesStable(pending.files);
      if (!allStable) {
        this.logger.debug(`Files not stable yet, re-queuing: ${pending.path}`);
        pending.status = 'collecting';
        pending.lastActivity = new Date();
        return;
      }

      // Detect the audiobook unit
      const unit = await this.audiobookDetector.detectSingleUnit(pending.path);

      if (unit) {
        await this.audiobookImporter.importAudiobook(unit);
      } else {
        // Check if individual files in the root should be separate audiobooks
        for (const filePath of pending.files) {
          if (isAudioFile(filePath)) {
            const fileUnit = await this.audiobookDetector.detectSingleUnit(filePath);
            if (fileUnit) {
              await this.audiobookImporter.importAudiobook(fileUnit);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process import ${pending.path}: ${error}`);
    } finally {
      this.pendingImports.delete(pending.path);
    }
  }

  private async verifyFilesStable(files: Set<string>): Promise<boolean> {
    for (const file of files) {
      if (isAudioFile(file) && !(await this.isFileStable(file))) {
        return false;
      }
    }
    return true;
  }

  private async isFileStable(filePath: string): Promise<boolean> {
    try {
      const stat1 = await fs.stat(filePath);
      await new Promise((resolve) => setTimeout(resolve, this.FILE_STABLE_CHECK_MS));
      const stat2 = await fs.stat(filePath);
      return stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs;
    } catch {
      return false;
    }
  }

  getPendingCount(): number {
    return this.pendingImports.size;
  }

  getPendingPaths(): string[] {
    return Array.from(this.pendingImports.keys());
  }
}
