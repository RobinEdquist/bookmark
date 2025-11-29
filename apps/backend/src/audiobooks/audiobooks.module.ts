import { Module } from '@nestjs/common';
import { AudiobooksController } from './audiobooks.controller';
import { AudiobooksService } from './audiobooks.service';
import { DatabaseModule } from '../database/database.module';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [DatabaseModule, LibraryWatcherModule, AppSettingsModule],
  controllers: [AudiobooksController],
  providers: [AudiobooksService],
  exports: [AudiobooksService],
})
export class AudiobooksModule {}
