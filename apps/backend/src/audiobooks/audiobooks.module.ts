import { Module } from '@nestjs/common';
import { AudiobooksController } from './audiobooks.controller';
import { AudiobooksService } from './audiobooks.service';
import { DatabaseModule } from '../database/database.module';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Module({
  imports: [DatabaseModule, LibraryWatcherModule],
  controllers: [AudiobooksController],
  providers: [AudiobooksService],
  exports: [AudiobooksService],
})
export class AudiobooksModule {}
