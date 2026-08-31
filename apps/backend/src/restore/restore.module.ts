import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import * as path from 'path';
import { DatabaseModule } from '../database/database.module';
import { AppDataModule } from '../app-data/app-data.module';
import { AppDataService } from '../app-data/app-data.service';
import { RestoreController } from './restore.controller';
import { RestoreGateway } from './restore.gateway';
import { RestoreService } from './restore.service';
import { RestoreImporterService } from './restore-importer.service';
import { AbsParserService } from './abs-parser.service';

@Module({
  imports: [
    DatabaseModule,
    AppDataModule,
    ConfigModule,
    AuthModule,
    // Stage uploads on disk under the app data temp directory (multer
    // creates it), not in memory: restore archives are up to 500 MB and
    // buffering them in RAM per concurrent upload is an easy OOM. Mirrors
    // ../backups/backups.module.ts.
    MulterModule.registerAsync({
      inject: [AppDataService],
      useFactory: (appData: AppDataService) => ({
        dest: path.join(appData.getTempPath(), 'restore-uploads'),
      }),
    }),
  ],
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
