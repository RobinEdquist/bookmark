import { Module, forwardRef } from '@nestjs/common';
import { ComicsController } from './comics.controller';
import { ComicsService } from './comics.service';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Module({
  imports: [forwardRef(() => LibraryWatcherModule)],
  controllers: [ComicsController],
  providers: [ComicsService],
  exports: [ComicsService],
})
export class ComicsModule {}
