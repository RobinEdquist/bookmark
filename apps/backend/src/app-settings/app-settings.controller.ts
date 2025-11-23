import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppSettingsService } from './app-settings.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

interface UpdateSettingsDto {
  signupsEnabled?: boolean;
}

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

  @Get()
  async getSettings() {
    const settings = await this.appSettingsService.getSettings();
    return {
      signupsEnabled: settings.signupsEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    if (dto.signupsEnabled === undefined) {
      throw new BadRequestException('No settings provided to update');
    }

    const settings = await this.appSettingsService.updateSettings({
      signupsEnabled: dto.signupsEnabled,
    });

    return {
      signupsEnabled: settings.signupsEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
