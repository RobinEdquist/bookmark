import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { HardcoverModule } from '../hardcover/hardcover.module';
import { TtsModule } from '../tts/tts.module';
import { GrFinderModule } from '../gr-finder/gr-finder.module';

@Module({
  imports: [LibraryWatcherModule, HardcoverModule, TtsModule, GrFinderModule],
  controllers: [TasksController],
})
export class TasksModule {}
