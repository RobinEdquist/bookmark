import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsService } from './app-settings.service';
import { AppSettingsController } from './app-settings.controller';
import { OidcConfigService } from '../auth/oidc-config.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [AppSettingsController],
  providers: [AppSettingsService, OidcConfigService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
