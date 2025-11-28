import { Module } from '@nestjs/common';
import { HardcoverController } from './hardcover.controller';
import { HardcoverService } from './hardcover.service';

@Module({
  controllers: [HardcoverController],
  providers: [HardcoverService],
  exports: [HardcoverService],
})
export class HardcoverModule {}
