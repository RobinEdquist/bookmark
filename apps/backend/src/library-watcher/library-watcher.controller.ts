// apps/backend/src/library-watcher/library-watcher.controller.ts
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { LibraryWatcherService } from './library-watcher.service';
import {
  HiddenAudiobooksResponseDto,
  LibraryWatcherStatusResponseDto,
  LibraryRescanResponseDto,
  LibraryScanResponseDto,
  RescanStatusResponseDto,
  RestoreHiddenAudiobookResponseDto,
} from './dto/library-watcher-response.dto';
import { AdminGuard } from '../common/guards/admin.guard';

@ApiTags('Library Watcher')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/library-watcher')
@UseGuards(AdminGuard)
export class LibraryWatcherController {
  constructor(private readonly libraryWatcherService: LibraryWatcherService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get watcher status (Admin)',
    description:
      'Returns the current status of the library file watcher including whether it is running and last scan time',
  })
  @ApiResponse({
    status: 200,
    description: 'Watcher status',
    type: LibraryWatcherStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getStatus() {
    return this.libraryWatcherService.getStatus();
  }

  @Post('scan')
  @ApiOperation({
    summary: 'Trigger audiobook scan (Admin)',
    description:
      'Reconcile the audiobook library with disk: import new folders, mark missing ones, and rebuild the file list of known audiobooks whose stored tracks are gone. Never rewrites metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan completed successfully with results',
    type: LibraryScanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async triggerScan(): Promise<LibraryScanResponseDto> {
    const result = await this.libraryWatcherService.manualScan();
    return {
      success: true,
      result,
    };
  }

  @Post('scan-ebooks')
  @ApiOperation({
    summary: 'Trigger ebook scan (Admin)',
    description:
      'Manually trigger a scan of the ebook library directory to discover new ebooks',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan completed successfully with results',
    type: LibraryScanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async triggerEbookScan(): Promise<LibraryScanResponseDto> {
    const result = await this.libraryWatcherService.manualEbookScan();
    return {
      success: true,
      result,
    };
  }

  @Post('scan-comics')
  @ApiOperation({
    summary: 'Trigger comic scan (Admin)',
    description:
      'Manually trigger a scan of the comic library directory to discover new series and books',
  })
  @ApiResponse({
    status: 200,
    description: 'Scan completed successfully with results',
    type: LibraryScanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async triggerComicScan(): Promise<LibraryScanResponseDto> {
    const result = await this.libraryWatcherService.manualComicScan();
    return {
      success: true,
      result,
    };
  }

  @Post('rescan')
  @ApiOperation({
    summary: 'Rescan all audiobooks (Admin)',
    description:
      'Re-scan metadata for all existing audiobooks in the library. This may take a while for large libraries.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rescan initiated successfully',
    type: LibraryRescanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async triggerRescan(): Promise<LibraryRescanResponseDto> {
    const result = await this.libraryWatcherService.rescanAllAudiobooks();
    return {
      success: true,
      result,
    };
  }

  @Post('rescan-comics')
  @ApiOperation({
    summary: 'Rescan all comic book metadata (Admin)',
    description:
      'Re-scan metadata for all existing comic books in the library. Re-extracts from CBZ/CBR/PDF files. Manually edited fields are preserved.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rescan completed with results',
    type: LibraryRescanResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async triggerComicRescan(): Promise<LibraryRescanResponseDto> {
    const result = await this.libraryWatcherService.rescanAllComics();
    return {
      success: true,
      result,
    };
  }

  @Get('hidden-audiobooks')
  @ApiOperation({
    summary: 'List hidden audiobooks (Admin)',
    description:
      'Audiobooks deleted with "keep files on disk". Scans and the watcher skip their folders until they are restored.',
  })
  @ApiResponse({
    status: 200,
    description: 'Hidden audiobooks, by title',
    type: HiddenAudiobooksResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async listHiddenAudiobooks(): Promise<HiddenAudiobooksResponseDto> {
    const hidden = await this.libraryWatcherService.listHiddenAudiobooks();
    return {
      items: hidden.map((audiobook) => ({
        id: audiobook.id,
        title: audiobook.title,
        folderPath: audiobook.filePath || null,
      })),
    };
  }

  @Post('hidden-audiobooks/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a hidden audiobook (Admin)',
    description:
      'Put a hidden audiobook back in the library, repairing its file list if tracks were renamed. If its folder no longer exists the record is deleted instead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Restored, or removed because its files are gone',
    type: RestoreHiddenAudiobookResponseDto,
  })
  @ApiResponse({ status: 400, description: 'No audiobook library configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'No hidden audiobook with this id' })
  async restoreHiddenAudiobook(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RestoreHiddenAudiobookResponseDto> {
    const outcome = await this.libraryWatcherService.restoreHiddenAudiobook(id);
    return { outcome };
  }

  @Get('rescan-status')
  @ApiOperation({
    summary: 'Get rescan status (Admin)',
    description:
      'Get the progress and status of an ongoing or last completed rescan operation',
  })
  @ApiResponse({
    status: 200,
    description: 'Rescan status and progress',
    type: RescanStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getRescanStatus() {
    return this.libraryWatcherService.getRescanStatus();
  }
}
