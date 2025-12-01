import { Controller, Get } from '@nestjs/common';
import { LibraryService, LibraryStats } from './library.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

export interface LibraryAvailability {
  audiobooks: boolean;
  ebooks: boolean;
}

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly appSettingsService: AppSettingsService,
  ) {}

  @Get('stats')
  async getStats(): Promise<LibraryStats> {
    return this.libraryService.getStats();
  }

  @Get('availability')
  async getAvailability(): Promise<LibraryAvailability> {
    const settings = await this.appSettingsService.getSettings();
    return {
      audiobooks: !!settings.audiobookLibraryPath,
      ebooks: !!settings.ebookLibraryPath,
    };
  }
}
