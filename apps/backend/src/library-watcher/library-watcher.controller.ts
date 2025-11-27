// apps/backend/src/library-watcher/library-watcher.controller.ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LibraryWatcherService } from './library-watcher.service';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('admin/library-watcher')
@UseGuards(AdminGuard)
export class LibraryWatcherController {
  constructor(private readonly libraryWatcherService: LibraryWatcherService) {}

  @Get('status')
  getStatus() {
    return this.libraryWatcherService.getStatus();
  }

  @Post('scan')
  async triggerScan() {
    const result = await this.libraryWatcherService.manualScan();
    return {
      success: true,
      result,
    };
  }
}
