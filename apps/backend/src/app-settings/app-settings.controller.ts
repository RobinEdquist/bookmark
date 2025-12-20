import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppSettingsService } from './app-settings.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { OidcConfigService } from '../auth/oidc-config.service';
import * as fs from 'fs/promises';
import { MetadataFieldPriority, DEFAULT_METADATA_PRIORITY } from './schema';

interface UpdateSettingsDto {
  signupsEnabled?: boolean;
  audiobookLibraryPath?: string | null;
  ebookLibraryPath?: string | null;
  metadataPriority?: MetadataFieldPriority;
  opdsEnabled?: boolean;
  oidcButtonText?: string;
  emailPasswordEnabled?: boolean;
  oidcAutoCreateUsers?: string;
  requestsEnabled?: boolean;
  requestsAudiobookCategory?: string;
  requestsEbookCategory?: string;
  requestsComicsCategory?: string;
  autoApproveRequestsPerWeek?: number;
}

@ApiTags('Settings')
@Controller('settings')
export class AppSettingsController {
  constructor(
    private readonly appSettingsService: AppSettingsService,
    private readonly oidcConfigService: OidcConfigService,
  ) {}

  @Get('public')
  @AllowAnonymous()
  @ApiOperation({
    summary: 'Get public settings',
    description:
      'Returns publicly accessible settings like signup status. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Public settings' })
  async getPublicSettings() {
    const settings = await this.appSettingsService.getSettings();
    return {
      signupsEnabled: settings.signupsEnabled,
    };
  }

  @Get('auth-config')
  @AllowAnonymous()
  @ApiOperation({
    summary: 'Get authentication configuration',
    description:
      'Returns authentication methods configuration (email/password, OIDC). No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Authentication configuration' })
  async getAuthConfig() {
    const settings = await this.appSettingsService.getSettings();
    const oidcEnabled = this.oidcConfigService.isOidcEnabled();

    return {
      emailPasswordEnabled: settings.emailPasswordEnabled,
      oidcEnabled,
      oidcButtonText: settings.oidcButtonText,
    };
  }

  @Get()
  @ApiSecurity('better-auth.session_token')
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Get all settings',
    description: 'Returns all application settings. Requires authentication.',
  })
  @ApiResponse({ status: 200, description: 'Application settings' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSettings() {
    const settings = await this.appSettingsService.getSettings();
    const mamClientConfigured = !!(
      process.env.MAM_CLIENT_URL && process.env.MAM_CLIENT_API_KEY
    );
    return {
      signupsEnabled: settings.signupsEnabled,
      audiobookLibraryPath: settings.audiobookLibraryPath,
      ebookLibraryPath: settings.ebookLibraryPath,
      opdsEnabled: settings.opdsEnabled,
      metadataPriority: settings.metadataPriority || DEFAULT_METADATA_PRIORITY,
      oidcButtonText: settings.oidcButtonText,
      emailPasswordEnabled: settings.emailPasswordEnabled,
      oidcAutoCreateUsers: settings.oidcAutoCreateUsers,
      requestsEnabled: settings.requestsEnabled,
      requestsAudiobookCategory: settings.requestsAudiobookCategory,
      requestsEbookCategory: settings.requestsEbookCategory,
      requestsComicsCategory: settings.requestsComicsCategory,
      autoApproveRequestsPerWeek: settings.autoApproveRequestsPerWeek,
      mamClientConfigured,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiSecurity('better-auth.session_token')
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Update settings (Admin)',
    description:
      'Update application settings including library paths, authentication, and feature flags. Requires admin role.',
  })
  @ApiResponse({ status: 200, description: 'Updated settings' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid path' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    if (
      dto.signupsEnabled === undefined &&
      dto.audiobookLibraryPath === undefined &&
      dto.ebookLibraryPath === undefined &&
      dto.metadataPriority === undefined &&
      dto.opdsEnabled === undefined &&
      dto.oidcButtonText === undefined &&
      dto.emailPasswordEnabled === undefined &&
      dto.oidcAutoCreateUsers === undefined &&
      dto.requestsEnabled === undefined &&
      dto.requestsAudiobookCategory === undefined &&
      dto.requestsEbookCategory === undefined &&
      dto.requestsComicsCategory === undefined &&
      dto.autoApproveRequestsPerWeek === undefined
    ) {
      throw new BadRequestException('No settings provided to update');
    }

    // Validate emailPasswordEnabled - can't disable if OIDC is not configured
    if (
      dto.emailPasswordEnabled === false &&
      !this.oidcConfigService.isOidcEnabled()
    ) {
      throw new BadRequestException(
        'Cannot disable email/password login when OIDC is not configured',
      );
    }

    // Validate oidcAutoCreateUsers values
    if (dto.oidcAutoCreateUsers !== undefined) {
      const validValues = ['auto', 'pending', 'disabled'];
      if (!validValues.includes(dto.oidcAutoCreateUsers)) {
        throw new BadRequestException('Invalid value for oidcAutoCreateUsers');
      }
    }

    // Validate audiobookLibraryPath if provided (null is allowed to clear the path)
    if (
      dto.audiobookLibraryPath !== undefined &&
      dto.audiobookLibraryPath !== null
    ) {
      await this.validateLibraryPath(dto.audiobookLibraryPath);
    }

    // Validate ebookLibraryPath if provided (null is allowed to clear the path)
    if (dto.ebookLibraryPath !== undefined && dto.ebookLibraryPath !== null) {
      await this.validateLibraryPath(dto.ebookLibraryPath);
    }

    const updates: {
      signupsEnabled?: boolean;
      audiobookLibraryPath?: string | null;
      ebookLibraryPath?: string | null;
      metadataPriority?: MetadataFieldPriority;
      opdsEnabled?: boolean;
      oidcButtonText?: string;
      emailPasswordEnabled?: boolean;
      oidcAutoCreateUsers?: string;
      requestsEnabled?: boolean;
      requestsAudiobookCategory?: string;
      requestsEbookCategory?: string;
      requestsComicsCategory?: string;
      autoApproveRequestsPerWeek?: number;
    } = {};
    if (dto.signupsEnabled !== undefined)
      updates.signupsEnabled = dto.signupsEnabled;
    if (dto.audiobookLibraryPath !== undefined)
      updates.audiobookLibraryPath = dto.audiobookLibraryPath;
    if (dto.ebookLibraryPath !== undefined)
      updates.ebookLibraryPath = dto.ebookLibraryPath;
    if (dto.metadataPriority !== undefined)
      updates.metadataPriority = dto.metadataPriority;
    if (dto.opdsEnabled !== undefined) updates.opdsEnabled = dto.opdsEnabled;
    if (dto.oidcButtonText !== undefined)
      updates.oidcButtonText = dto.oidcButtonText;
    if (dto.emailPasswordEnabled !== undefined)
      updates.emailPasswordEnabled = dto.emailPasswordEnabled;
    if (dto.oidcAutoCreateUsers !== undefined)
      updates.oidcAutoCreateUsers = dto.oidcAutoCreateUsers;
    if (dto.requestsEnabled !== undefined)
      updates.requestsEnabled = dto.requestsEnabled;
    if (dto.requestsAudiobookCategory !== undefined)
      updates.requestsAudiobookCategory = dto.requestsAudiobookCategory;
    if (dto.requestsEbookCategory !== undefined)
      updates.requestsEbookCategory = dto.requestsEbookCategory;
    if (dto.requestsComicsCategory !== undefined)
      updates.requestsComicsCategory = dto.requestsComicsCategory;
    if (dto.autoApproveRequestsPerWeek !== undefined)
      updates.autoApproveRequestsPerWeek = dto.autoApproveRequestsPerWeek;

    const settings = await this.appSettingsService.updateSettings(updates);
    const mamClientConfigured = !!(
      process.env.MAM_CLIENT_URL && process.env.MAM_CLIENT_API_KEY
    );

    return {
      signupsEnabled: settings.signupsEnabled,
      audiobookLibraryPath: settings.audiobookLibraryPath,
      ebookLibraryPath: settings.ebookLibraryPath,
      opdsEnabled: settings.opdsEnabled,
      metadataPriority: settings.metadataPriority || DEFAULT_METADATA_PRIORITY,
      oidcButtonText: settings.oidcButtonText,
      emailPasswordEnabled: settings.emailPasswordEnabled,
      oidcAutoCreateUsers: settings.oidcAutoCreateUsers,
      requestsEnabled: settings.requestsEnabled,
      requestsAudiobookCategory: settings.requestsAudiobookCategory,
      requestsEbookCategory: settings.requestsEbookCategory,
      requestsComicsCategory: settings.requestsComicsCategory,
      autoApproveRequestsPerWeek: settings.autoApproveRequestsPerWeek,
      mamClientConfigured,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  private async validateLibraryPath(path: string): Promise<void> {
    try {
      const stats = await fs.stat(path);
      if (!stats.isDirectory()) {
        throw new BadRequestException('Path is not a directory');
      }
      await fs.access(path, fs.constants.R_OK);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Path does not exist or is not accessible');
    }
  }
}
