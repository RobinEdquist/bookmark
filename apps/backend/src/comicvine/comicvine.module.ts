import { Module, forwardRef } from '@nestjs/common';
import { ComicvineController } from './comicvine.controller';
import { ComicvineService } from './comicvine.service';
import { ComicvineSyncProcessor } from './comicvine-sync.processor';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Module({
  imports: [forwardRef(() => LibraryWatcherModule)],
  controllers: [ComicvineController],
  providers: [ComicvineService, ComicvineSyncProcessor],
  exports: [ComicvineService],
})
export class ComicvineModule {}
