import { Module } from '@nestjs/common';
import { GrFinderController } from './gr-finder.controller';
import { GrFinderService } from './gr-finder.service';
import { GoodreadsScraperService } from './goodreads-scraper.service';

@Module({
  controllers: [GrFinderController],
  providers: [GrFinderService, GoodreadsScraperService],
  exports: [GrFinderService],
})
export class GrFinderModule {}
