import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { ImageProcessingService } from './image-processing.service';
import { CoverService } from './cover.service';
import { MetadataResolverService } from './metadata-resolver.service';
import { MetadataEntityService } from './metadata-entity.service';
import { ApiTokenMiddleware } from './middleware/api-token.middleware';
import { DatabaseModule } from '../database/database.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Global()
@Module({
  imports: [DatabaseModule, ApiKeysModule, AppSettingsModule],
  providers: [
    WorkerPoolService,
    ImageProcessingService,
    CoverService,
    MetadataEntityService,
    MetadataResolverService,
    ApiTokenMiddleware,
  ],
  exports: [
    WorkerPoolService,
    ImageProcessingService,
    CoverService,
    MetadataEntityService,
    MetadataResolverService,
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiTokenMiddleware).forRoutes('*');
  }
}
