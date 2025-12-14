import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MamClientModule } from '../mam-client';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { RequestsAdminController } from './requests-admin.controller';
import { RequestStatusScheduler } from './request-status.scheduler';
import { CanRequestGuard } from '../common/guards/can-request.guard';

@Module({
  imports: [DatabaseModule, MamClientModule],
  controllers: [RequestsController, RequestsAdminController],
  providers: [RequestsService, RequestStatusScheduler, CanRequestGuard],
  exports: [RequestsService],
})
export class RequestsModule {}
