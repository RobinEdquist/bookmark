import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { EbooksController } from './ebooks.controller';
import { EbooksService } from './ebooks.service';
import { EbookGroupsController } from './ebook-groups.controller';
import { EbookGroupsService } from './ebook-groups.service';
import { OpdsController } from './opds.controller';
import { OpdsService } from './opds.service';
import { DatabaseModule } from '../database/database.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { EventsModule } from '../events/events.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';

@Module({
  imports: [
    DatabaseModule,
    AppSettingsModule,
    EventsModule,
    ApiKeysModule,
    AuthModule,
    forwardRef(() => LibraryWatcherModule),
  ],
  // Order matters: EbooksController has a catch-all `@Get(':id')`, so any
  // controller sharing the `ebooks` prefix with literal sub-paths
  // (`ebooks/opds`, `ebooks/groups`) must be registered before it.
  // `ebook-groups.e2e-spec.ts` guards this.
  controllers: [OpdsController, EbookGroupsController, EbooksController],
  providers: [
    EbooksService,
    EbookGroupsService,
    OpdsService,
    CanEditMetadataGuard,
    CanDeleteGuard,
  ],
  exports: [EbooksService],
})
export class EbooksModule {}
