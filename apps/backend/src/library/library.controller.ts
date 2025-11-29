import { Controller, Get } from '@nestjs/common';
import { LibraryService, LibraryStats } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('stats')
  async getStats(): Promise<LibraryStats> {
    return this.libraryService.getStats();
  }
}
