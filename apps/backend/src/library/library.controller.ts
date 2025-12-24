import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { LibraryService, LibraryStats } from './library.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

export interface LibraryAvailability {
  audiobooks: boolean;
  ebooks: boolean;
  opds: boolean;
}

@ApiTags('Library')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly appSettingsService: AppSettingsService,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get library statistics',
    description:
      'Returns statistics about the library including total audiobooks, ebooks, authors, and storage usage',
  })
  @ApiResponse({ status: 200, description: 'Library statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStats(): Promise<LibraryStats> {
    return this.libraryService.getStats();
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Get library availability',
    description:
      'Returns which library features are available (audiobooks, ebooks, OPDS) based on configuration',
  })
  @ApiResponse({ status: 200, description: 'Library feature availability' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAvailability(): Promise<LibraryAvailability> {
    const settings = await this.appSettingsService.getSettings();
    return {
      audiobooks: !!settings.audiobookLibraryPath,
      ebooks: !!settings.ebookLibraryPath,
      opds: !!settings.opdsEnabled,
    };
  }
}
