import { Module } from '@nestjs/common';
import { ComicProgressController } from './comic-progress.controller';
import { ComicProgressService } from './comic-progress.service';

@Module({
  controllers: [ComicProgressController],
  providers: [ComicProgressService],
  exports: [ComicProgressService],
})
export class ComicProgressModule {}
