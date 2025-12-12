// apps/backend/src/import-errors/import-errors.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ImportErrorsService } from './import-errors.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { Session } from '@thallesp/nestjs-better-auth';
import { ImportQueueService } from '../library-watcher/import-queue.service';

@Controller('admin/import-errors')
@UseGuards(AdminGuard)
export class ImportErrorsController {
  constructor(
    private readonly importErrorsService: ImportErrorsService,
    private readonly importQueueService: ImportQueueService,
  ) {}

  @Get()
  async listErrors(
    @Query('status') status?: 'pending' | 'retrying' | 'resolved' | 'ignored',
    @Query('libraryType') libraryType?: 'audiobook' | 'ebook',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.importErrorsService.getErrors({
      status,
      libraryType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  async getError(@Param('id') id: string) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }
    return error;
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retryImport(@Param('id') id: string) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }

    // Determine the library type from the file path
    const libraryType = await this.importErrorsService.getLibraryTypeForPath(
      error.filePath,
    );
    if (!libraryType) {
      throw new BadRequestException(
        'Could not determine library type for file path',
      );
    }

    // Get the library path for queueing
    const libraryPath = await this.importErrorsService.getLibraryPath(
      libraryType,
    );
    if (!libraryPath) {
      throw new BadRequestException('Library path not configured');
    }

    // Mark as retrying
    await this.importErrorsService.markRetrying(id);

    // Queue the file for re-import
    this.importQueueService.queueFile(error.filePath, libraryPath, libraryType);

    return { success: true, message: 'Retry queued' };
  }

  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  async ignoreError(
    @Param('id') id: string,
    @Session() session: { user: { id: string } },
  ) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }

    await this.importErrorsService.markIgnored(id, session.user.id);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteError(@Param('id') id: string) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }

    await this.importErrorsService.deleteError(id);
  }
}
