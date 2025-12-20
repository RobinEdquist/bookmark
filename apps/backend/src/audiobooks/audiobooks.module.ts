import { Module } from '@nestjs/common';
import { AudiobooksController } from './audiobooks.controller';
import { AudiobooksService } from './audiobooks.service';
import { DatabaseModule } from '../database/database.module';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';

@Module({
  imports: [DatabaseModule, LibraryWatcherModule, AppSettingsModule],
  controllers: [AudiobooksController],
  providers: [AudiobooksService, CanEditMetadataGuard],
  exports: [AudiobooksService],
})
export class AudiobooksModule {}
