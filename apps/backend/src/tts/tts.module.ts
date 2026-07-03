import { Module, forwardRef } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TtsGenerationProcessor } from './tts-generation.processor';
import { M4bAssemblerService } from './m4b-assembler.service';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { AppDataModule } from '../app-data/app-data.module';
import { EventsModule } from '../events/events.module';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Module({
  imports: [
    AppSettingsModule,
    AppDataModule,
    EventsModule,
    forwardRef(() => LibraryWatcherModule),
  ],
  controllers: [TtsController],
  providers: [TtsService, TtsGenerationProcessor, M4bAssemblerService],
  exports: [TtsService],
})
export class TtsModule {}
