import { Module, forwardRef } from '@nestjs/common';
import { ComicsController } from './comics.controller';
import { ComicsService } from './comics.service';
import { ComicsCollectionsService } from './comics-collections.service';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';

@Module({
  imports: [forwardRef(() => LibraryWatcherModule)],
  controllers: [ComicsController],
  providers: [
    ComicsService,
    ComicsCollectionsService,
    CanEditMetadataGuard,
    CanDeleteGuard,
  ],
  exports: [ComicsService, ComicsCollectionsService],
})
export class ComicsModule {}
