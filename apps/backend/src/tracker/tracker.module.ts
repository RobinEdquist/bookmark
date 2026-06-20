import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TrackerService } from './tracker.service';

@Module({
  imports: [ConfigModule],
  providers: [TrackerService],
  exports: [TrackerService],
})
export class TrackerModule {}
