import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileAuthService } from './mobile-auth.service';
import { OidcConfigService } from '../auth/oidc-config.service';

@Module({
  imports: [ConfigModule, DatabaseModule, ApiKeysModule],
  controllers: [MobileAuthController],
  // OidcConfigService is provided per-module, same as AppSettingsModule does.
  providers: [MobileAuthService, OidcConfigService],
})
export class MobileAuthModule {}
