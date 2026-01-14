import { Module } from '@nestjs/common';
import { EbookProgressController } from './ebook-progress.controller';
import { EbookProgressService } from './ebook-progress.service';

@Module({
  controllers: [EbookProgressController],
  providers: [EbookProgressService],
  exports: [EbookProgressService],
})
export class EbookProgressModule {}
