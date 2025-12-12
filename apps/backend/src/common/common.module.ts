import { Global, Module } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { ImageProcessingService } from './image-processing.service';

@Global()
@Module({
  providers: [WorkerPoolService, ImageProcessingService],
  exports: [WorkerPoolService, ImageProcessingService],
})
export class CommonModule {}
