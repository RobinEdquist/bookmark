import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ComicsController } from './comics.controller';
import { ComicsService } from './comics.service';
import { ComicsCollectionsService } from './comics-collections.service';
import { ComicsOpdsController } from './comics-opds.controller';
import { ComicsOpdsService } from './comics-opds.service';
import { ComicPageService } from './comic-page.service';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ComicProgressModule } from '../comic-progress/comic-progress.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';

@Module({
  imports: [
    forwardRef(() => LibraryWatcherModule),
    AppSettingsModule,
    ApiKeysModule,
    AuthModule,
    ComicProgressModule,
  ],
  controllers: [ComicsOpdsController, ComicsController],
  providers: [
    ComicsService,
    ComicsCollectionsService,
    ComicsOpdsService,
    ComicPageService,
    CanEditMetadataGuard,
    CanDeleteGuard,
  ],
  exports: [ComicsService, ComicsCollectionsService],
})
export class ComicsModule {}
