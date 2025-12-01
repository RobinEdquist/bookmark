import { Module } from '@nestjs/common';
import { EbooksController } from './ebooks.controller';
import { EbooksService } from './ebooks.service';
import { DatabaseModule } from '../database/database.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [DatabaseModule, AppSettingsModule, EventsModule],
  controllers: [EbooksController],
  providers: [EbooksService],
  exports: [EbooksService],
})
export class EbooksModule {}
