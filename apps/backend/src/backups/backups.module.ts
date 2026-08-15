import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import * as path from 'path';
import { AppDataService } from '../app-data/app-data.service';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [
    ConfigModule,
    // Stage uploads under the app data temp directory (multer creates it),
    // not os.tmpdir(): backup archives can be gigabytes and belong on the
    // data volume, never in the container's root filesystem.
    MulterModule.registerAsync({
      inject: [AppDataService],
      useFactory: (appData: AppDataService) => ({
        dest: path.join(appData.getTempPath(), 'backup-uploads'),
      }),
    }),
  ],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
