import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';
import { ReadingListsController } from './reading-lists.controller';
import { ReadingListsService } from './reading-lists.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReadingListsController],
  providers: [ReadingListsService, CanEditMetadataGuard, CanDeleteGuard],
  exports: [ReadingListsService],
})
export class ReadingListsModule {}
