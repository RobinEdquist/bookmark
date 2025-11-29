// apps/backend/src/library-watcher/library-watcher.module.ts
import { Module } from '@nestjs/common';
import { LibraryWatcherController } from './library-watcher.controller';
import { LibraryWatcherService } from './library-watcher.service';
import { FileWatcherService } from './file-watcher.service';
import { LibraryScannerService } from './library-scanner.service';
import { AudiobookDetectorService } from './audiobook-detector.service';
import { AudiobookImporterService } from './audiobook-importer.service';
import { ImportQueueService } from './import-queue.service';
import { EmbeddedMetadataProvider } from './metadata/embedded-metadata.provider';
import { HardcoverModule } from '../hardcover/hardcover.module';

@Module({
  imports: [HardcoverModule],
  controllers: [LibraryWatcherController],
  providers: [
    LibraryWatcherService,
    FileWatcherService,
    LibraryScannerService,
    AudiobookDetectorService,
    AudiobookImporterService,
    ImportQueueService,
    EmbeddedMetadataProvider,
  ],
  exports: [LibraryWatcherService, EmbeddedMetadataProvider],
})
export class LibraryWatcherModule {}
