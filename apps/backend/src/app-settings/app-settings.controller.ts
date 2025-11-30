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
import * as fs from 'fs/promises';
import {
  MetadataFieldPriority,
  DEFAULT_METADATA_PRIORITY,
} from './schema';

interface UpdateSettingsDto {
  signupsEnabled?: boolean;
  libraryPath?: string;
  metadataPriority?: MetadataFieldPriority;
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
      libraryPath: settings.libraryPath,
      metadataPriority: settings.metadataPriority || DEFAULT_METADATA_PRIORITY,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    if (
      dto.signupsEnabled === undefined &&
      dto.libraryPath === undefined &&
      dto.metadataPriority === undefined
    ) {
      throw new BadRequestException('No settings provided to update');
    }

    // Validate libraryPath if provided
    if (dto.libraryPath !== undefined) {
      try {
        const stats = await fs.stat(dto.libraryPath);
        if (!stats.isDirectory()) {
          throw new BadRequestException('Path is not a directory');
        }
        await fs.access(dto.libraryPath, fs.constants.R_OK);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Path does not exist or is not accessible');
      }
    }

    const updates: {
      signupsEnabled?: boolean;
      libraryPath?: string;
      metadataPriority?: MetadataFieldPriority;
    } = {};
    if (dto.signupsEnabled !== undefined) updates.signupsEnabled = dto.signupsEnabled;
    if (dto.libraryPath !== undefined) updates.libraryPath = dto.libraryPath;
    if (dto.metadataPriority !== undefined) updates.metadataPriority = dto.metadataPriority;

    const settings = await this.appSettingsService.updateSettings(updates);

    return {
      signupsEnabled: settings.signupsEnabled,
      libraryPath: settings.libraryPath,
      metadataPriority: settings.metadataPriority || DEFAULT_METADATA_PRIORITY,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
