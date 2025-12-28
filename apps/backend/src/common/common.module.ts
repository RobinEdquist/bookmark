import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { ImageProcessingService } from './image-processing.service';
import { CoverService } from './cover.service';
import { ApiTokenMiddleware } from './middleware/api-token.middleware';
import { DatabaseModule } from '../database/database.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Global()
@Module({
  imports: [DatabaseModule, ApiKeysModule],
  providers: [
    WorkerPoolService,
    ImageProcessingService,
    CoverService,
    ApiTokenMiddleware,
  ],
  exports: [WorkerPoolService, ImageProcessingService, CoverService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiTokenMiddleware).forRoutes('*');
  }
}
