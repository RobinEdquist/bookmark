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
import { MetadataWorkerPoolService } from './metadata/metadata-worker-pool.service';
import { HardcoverModule } from '../hardcover/hardcover.module';
import { RequestsModule } from '../requests';

@Module({
  imports: [HardcoverModule, RequestsModule],
  controllers: [LibraryWatcherController],
  providers: [
    LibraryWatcherService,
    FileWatcherService,
    LibraryScannerService,
    MediaDetectorService,
    MediaImporterService,
    ImportQueueService,
    MetadataWorkerPoolService,
    EmbeddedMetadataProvider,
    EbookMetadataProvider,
  ],
  exports: [
    LibraryWatcherService,
    EmbeddedMetadataProvider,
    EbookMetadataProvider,
    ImportQueueService,
    LibraryScannerService,
  ],
})
export class LibraryWatcherModule {}
