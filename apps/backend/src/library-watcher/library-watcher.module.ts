// apps/backend/src/library-watcher/library-watcher.module.ts
import { Module } from '@nestjs/common';
import { LibraryWatcherController } from './library-watcher.controller';
import { LibraryWatcherService } from './library-watcher.service';
import { FileWatcherService } from './file-watcher.service';
import { LibraryScannerService } from './library-scanner.service';
import { MediaDetectorService } from './media-detector.service';
import { MediaImporterService } from './media-importer.service';
import { ImportQueueService } from './import-queue.service';
import { EmbeddedMetadataProvider } from './metadata/embedded-metadata.provider';
import { EbookMetadataProvider } from './metadata/ebook-metadata.provider';
import { HardcoverModule } from '../hardcover/hardcover.module';

@Module({
  imports: [HardcoverModule],
  controllers: [LibraryWatcherController],
  providers: [
    LibraryWatcherService,
    FileWatcherService,
    LibraryScannerService,
    MediaDetectorService,
    MediaImporterService,
    ImportQueueService,
    EmbeddedMetadataProvider,
    EbookMetadataProvider,
  ],
  exports: [
    LibraryWatcherService,
    EmbeddedMetadataProvider,
    EbookMetadataProvider,
    ImportQueueService,
  ],
})
export class LibraryWatcherModule {}
