import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GenresAdminController } from './genres-admin.controller';
import { GenresAdminService } from './genres-admin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GenresAdminController],
  providers: [GenresAdminService],
  exports: [GenresAdminService],
})
export class GenresModule {}
