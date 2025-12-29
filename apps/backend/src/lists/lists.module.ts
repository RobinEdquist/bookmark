import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
