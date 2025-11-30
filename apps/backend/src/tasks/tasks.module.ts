import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';
import { HardcoverModule } from '../hardcover/hardcover.module';

@Module({
  imports: [LibraryWatcherModule, HardcoverModule],
  controllers: [TasksController],
})
export class TasksModule {}
