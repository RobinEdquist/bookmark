import { Module } from '@nestjs/common';
import { GrFinderController } from './gr-finder.controller';
import { GrFinderService } from './gr-finder.service';

@Module({
  controllers: [GrFinderController],
  providers: [GrFinderService],
  exports: [GrFinderService],
})
export class GrFinderModule {}
