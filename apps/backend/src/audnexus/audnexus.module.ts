import { Module } from '@nestjs/common';
import { AudnexusController } from './audnexus.controller';
import { AudnexusService } from './audnexus.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AudnexusController],
  providers: [AudnexusService],
  exports: [AudnexusService],
})
export class AudnexusModule {}
