import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AudiobookBookmarksController } from './audiobook-bookmarks.controller';
import { AudiobookBookmarksService } from './audiobook-bookmarks.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AudiobookBookmarksController],
  providers: [AudiobookBookmarksService],
})
export class AudiobookBookmarksModule {}
