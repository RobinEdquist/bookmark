import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { CommonModule } from '../common/common.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [DatabaseModule, AppSettingsModule, CommonModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
