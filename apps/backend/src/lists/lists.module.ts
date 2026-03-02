import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [DatabaseModule, AppSettingsModule],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
