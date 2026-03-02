import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [SeriesController],
  providers: [SeriesService, CanEditMetadataGuard],
  exports: [SeriesService],
})
export class SeriesModule {}
