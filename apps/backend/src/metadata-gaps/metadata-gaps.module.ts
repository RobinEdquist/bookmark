import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { DatabaseModule } from '../database/database.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { MetadataGapsController } from './metadata-gaps.controller';
import { MetadataGapsService } from './metadata-gaps.service';

@Module({
  imports: [DatabaseModule, AppSettingsModule, ApiKeysModule, AuthModule],
  controllers: [MetadataGapsController],
  providers: [MetadataGapsService, CanEditMetadataGuard],
  exports: [MetadataGapsService],
})
export class MetadataGapsModule {}
