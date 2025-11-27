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
} from '@nestjs/common';
import { ImportErrorsService } from './import-errors.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { Session } from '@thallesp/nestjs-better-auth';

@Controller('admin/import-errors')
@UseGuards(AdminGuard)
export class ImportErrorsController {
  constructor(private readonly importErrorsService: ImportErrorsService) {}

  @Get()
  async listErrors(
    @Query('status') status?: 'pending' | 'retrying' | 'resolved' | 'ignored',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.importErrorsService.getErrors({
      status,
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

    await this.importErrorsService.markRetrying(id);

    // Note: Actual retry logic will be added when LibraryWatcherService is created
    // For now, just return the updated status
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
