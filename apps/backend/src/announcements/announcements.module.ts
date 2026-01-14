import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsAdminController } from './announcements-admin.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AnnouncementsController, AnnouncementsAdminController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
