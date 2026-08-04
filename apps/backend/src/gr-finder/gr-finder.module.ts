import { Module } from '@nestjs/common';
import { GrFinderController } from './gr-finder.controller';
import { GrFinderService } from './gr-finder.service';
import { GoodreadsScraperService } from './goodreads-scraper.service';
import { GoodreadsLinkQueueService } from './goodreads-link-queue.service';

@Module({
  controllers: [GrFinderController],
  providers: [
    GrFinderService,
    GoodreadsScraperService,
    GoodreadsLinkQueueService,
  ],
  exports: [GrFinderService, GoodreadsLinkQueueService],
})
export class GrFinderModule {}
