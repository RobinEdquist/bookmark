import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { HardcoverModule } from '../hardcover/hardcover.module';
import { TtsModule } from '../tts/tts.module';

@Module({
  imports: [LibraryWatcherModule, HardcoverModule, TtsModule],
  controllers: [TasksController],
})
export class TasksModule {}
