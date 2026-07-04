import { Module } from '@nestjs/common';
import { ItunesController } from './itunes.controller';
import { ItunesService } from './itunes.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ItunesController],
  providers: [ItunesService],
  exports: [ItunesService],
})
export class ItunesModule {}
