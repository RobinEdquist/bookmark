import { Global, Module } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { ImageProcessingService } from './image-processing.service';
import { CoverService } from './cover.service';

@Global()
@Module({
  providers: [WorkerPoolService, ImageProcessingService, CoverService],
  exports: [WorkerPoolService, ImageProcessingService, CoverService],
})
export class CommonModule {}
