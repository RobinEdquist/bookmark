import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StatsModule } from '../stats/stats.module';
import { MetricsService } from './metrics.service';

@Module({
  imports: [ConfigModule, StatsModule],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
