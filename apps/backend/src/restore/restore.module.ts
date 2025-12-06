import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { DatabaseModule } from '../database/database.module';
import { AppDataModule } from '../app-data/app-data.module';
import { RestoreController } from './restore.controller';
import { RestoreGateway } from './restore.gateway';
import { RestoreService } from './restore.service';
import { RestoreImporterService } from './restore-importer.service';
import { AbsParserService } from './abs-parser.service';

@Module({
  imports: [DatabaseModule, AppDataModule, ConfigModule, AuthModule],
  controllers: [RestoreController],
  providers: [
    AbsParserService,
    RestoreService,
    RestoreImporterService,
    RestoreGateway,
  ],
  exports: [RestoreService, RestoreImporterService],
})
export class RestoreModule {}
