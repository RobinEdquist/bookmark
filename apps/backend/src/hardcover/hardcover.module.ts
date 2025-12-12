import { Module, forwardRef } from '@nestjs/common';
import { HardcoverController } from './hardcover.controller';
import { HardcoverService } from './hardcover.service';
import { HardcoverSyncProcessor } from './hardcover-sync.processor';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Module({
  imports: [forwardRef(() => LibraryWatcherModule)],
  controllers: [HardcoverController],
  providers: [HardcoverService, HardcoverSyncProcessor],
  exports: [HardcoverService],
})
export class HardcoverModule {}
