import { Module } from '@nestjs/common';
import { HardcoverController } from './hardcover.controller';
import { HardcoverService } from './hardcover.service';
import { HardcoverSyncProcessor } from './hardcover-sync.processor';

@Module({
  controllers: [HardcoverController],
  providers: [HardcoverService, HardcoverSyncProcessor],
  exports: [HardcoverService],
})
export class HardcoverModule {}
