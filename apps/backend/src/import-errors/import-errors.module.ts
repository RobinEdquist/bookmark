// apps/backend/src/import-errors/import-errors.module.ts
import { Global, Module, forwardRef } from '@nestjs/common';
import { ImportErrorsController } from './import-errors.controller';
import { ImportErrorsService } from './import-errors.service';
import { LibraryWatcherModule } from '../library-watcher/library-watcher.module';

@Global()
@Module({
  imports: [forwardRef(() => LibraryWatcherModule)],
  controllers: [ImportErrorsController],
  providers: [ImportErrorsService],
  exports: [ImportErrorsService],
})
export class ImportErrorsModule {}
