import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppSettingsService } from './app-settings.service';

@Controller('settings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get('public')
  @AllowAnonymous()
  async getPublicSettings() {
    const settings = await this.appSettingsService.getSettings();
    return {
      signupsEnabled: settings.signupsEnabled,
    };
  }
}
