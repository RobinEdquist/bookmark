import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { EbooksController } from './ebooks.controller';
import { EbooksService } from './ebooks.service';
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
  controllers: [OpdsController, EbooksController],
  providers: [EbooksService, OpdsService, CanEditMetadataGuard, CanDeleteGuard],
  exports: [EbooksService],
})
export class EbooksModule {}
