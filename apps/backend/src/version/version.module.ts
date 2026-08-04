import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';
import { UpdateCheckService } from './update-check.service';

@Module({
  imports: [ConfigModule],
  controllers: [VersionController],
  providers: [VersionService, UpdateCheckService],
  exports: [VersionService, UpdateCheckService],
})
export class VersionModule {}
