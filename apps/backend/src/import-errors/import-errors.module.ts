// apps/backend/src/import-errors/import-errors.module.ts
import { Global, Module } from '@nestjs/common';
import { ImportErrorsController } from './import-errors.controller';
import { ImportErrorsService } from './import-errors.service';

@Global()
@Module({
  controllers: [ImportErrorsController],
  providers: [ImportErrorsService],
  exports: [ImportErrorsService],
})
export class ImportErrorsModule {}
