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
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import * as fs from 'fs/promises';
import { ImportErrorsService } from './import-errors.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { Session } from '@thallesp/nestjs-better-auth';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import {
  ImportErrorListResponseDto,
  ImportErrorDto,
  ImportRetryResponseDto,
} from './dto/import-errors-response.dto';
import { SuccessResponseDto } from '../common/dto';

@ApiTags('Import Errors')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/import-errors')
@UseGuards(AdminGuard)
export class ImportErrorsController {
  constructor(
    private readonly importErrorsService: ImportErrorsService,
    private readonly importQueueService: ImportQueueService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List import errors (Admin)',
    description:
      'Returns a paginated list of import errors with optional status filter. Requires admin role.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'retrying', 'resolved', 'ignored'],
    description: 'Filter by error status',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of items to skip for pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'List of import errors',
    type: ImportErrorListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
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
  @ApiOperation({
    summary: 'Get import error details (Admin)',
    description:
      'Returns detailed information about a specific import error. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Import error UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Import error details',
    type: ImportErrorDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Import error not found' })
  async getError(@Param('id') id: string) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }
    return error;
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry failed import (Admin)',
    description:
      'Queue a failed import for retry. The file will be re-processed. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Import error UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Retry queued successfully',
    type: ImportRetryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot determine library type or path no longer exists',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Import error not found' })
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
    const libraryPath =
      await this.importErrorsService.getLibraryPath(libraryType);
    if (!libraryPath) {
      throw new BadRequestException('Library path not configured');
    }

    // Mark as retrying
    await this.importErrorsService.markRetrying(id);

    // Queue for re-import - check if path is a directory or file
    // Audiobook errors typically store directory paths, ebook errors store file paths
    try {
      const stat = await fs.stat(error.filePath);
      if (stat.isDirectory()) {
        this.importQueueService.queueDirectory(
          error.filePath,
          libraryPath,
          libraryType,
        );
      } else {
        this.importQueueService.queueFile(
          error.filePath,
          libraryPath,
          libraryType,
        );
      }
    } catch {
      // Path no longer exists - still mark as retrying but let the queue handle the error
      throw new BadRequestException(
        'File or directory no longer exists at the original path',
      );
    }

    return { success: true, message: 'Retry queued' };
  }

  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ignore import error (Admin)',
    description:
      'Mark an import error as ignored. It will no longer appear in the pending errors list. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Import error UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Error ignored successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Import error not found' })
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
  @ApiOperation({
    summary: 'Delete import error (Admin)',
    description:
      'Permanently delete an import error record. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Import error UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Error deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Import error not found' })
  async deleteError(@Param('id') id: string) {
    const error = await this.importErrorsService.getError(id);
    if (!error) {
      throw new NotFoundException('Import error not found');
    }

    await this.importErrorsService.deleteError(id);
  }
}
