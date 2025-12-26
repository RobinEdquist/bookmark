import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../common/guards/admin.guard';
import { RestoreService } from './restore.service';
import { RestoreImporterService } from './restore-importer.service';
import {
  SelectLibraryDto,
  SetPathMappingsDto,
  SetUserMappingsDto,
  SetRestoreOptionsDto,
} from './dto/restore.dto';
import { RestoreSession, ImportPreview } from './types/restore-session.types';
import {
  UploadBackupResponseDto,
  RestoreSessionDto,
  RestoreSuccessMessageDto,
  ImportPreviewDto,
  BookmarkUserDto,
} from './dto/restore-response.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as authSchema from '../auth/schema';

@ApiTags('Restore')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/restore')
@UseGuards(AdminGuard)
export class RestoreController {
  private readonly logger = new Logger('RestoreController');

  constructor(
    private readonly restoreService: RestoreService,
    private readonly restoreImporterService: RestoreImporterService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof authSchema>,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload backup file (Admin)',
    description:
      'Upload an AudioBookShelf backup file (.audiobookshelf) and create a restore session. Max file size: 500 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'AudioBookShelf backup file',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Backup uploaded and session created',
    type: UploadBackupResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async uploadBackup(@UploadedFile() file: Express.Multer.File): Promise<{
    success: boolean;
    session: {
      id: string;
      state: string;
      availableLibraries?: Array<{
        id: string;
        name: string;
        folders: string[];
      }>;
    };
  }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type (.audiobookshelf files are actually zip archives)
    const isValidMime =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/octet-stream';
    const isValidExtension =
      file.originalname.endsWith('.audiobookshelf') ||
      file.originalname.endsWith('.zip');
    if (!isValidMime && !isValidExtension) {
      throw new BadRequestException(
        'Only .audiobookshelf backup files are allowed',
      );
    }

    // Validate file size (500MB max)
    if (file.size > 500 * 1024 * 1024) {
      throw new BadRequestException('File size must be less than 500 MB');
    }

    this.logger.log(
      `[ABS-RESTORE-API] Received backup upload: ${file.originalname}`,
    );

    try {
      const session = await this.restoreService.createSession(file);

      // Get available libraries from parsed backup
      const backupDetails = await this.restoreService.getBackupDetails(
        session.id,
      );
      const availableLibraries = backupDetails
        ? backupDetails.libraries.map((lib) => ({
            id: lib.id,
            name: lib.name,
            folders:
              backupDetails.libraryFolders.get(lib.id)?.map((f) => f.path) ||
              [],
          }))
        : undefined;

      this.logger.log(
        `[ABS-RESTORE-API] Session ${session.id} created successfully with ${availableLibraries?.length || 0} libraries`,
      );

      return {
        success: true,
        session: {
          id: session.id,
          state: session.state,
          availableLibraries,
        },
      };
    } catch (error) {
      this.logger.error(`[ABS-RESTORE-API] Upload failed:`, error);
      throw error;
    }
  }

  @Get('sessions/:id')
  @ApiOperation({
    summary: 'Get session details (Admin)',
    description:
      'Get the current status and details of a restore session including available libraries',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Session details with available libraries',
    type: RestoreSessionDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Param('id') sessionId: string): Promise<
    RestoreSession & {
      availableLibraries?: Array<{
        id: string;
        name: string;
        folders: string[];
      }>;
    }
  > {
    this.logger.log(`[ABS-RESTORE-API] Getting session: ${sessionId}`);

    const session = this.restoreService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Restore session ${sessionId} not found`);
    }

    // Include available libraries from parsed backup
    const backupDetails = this.restoreService.getBackupDetails(sessionId);
    const availableLibraries = backupDetails
      ? backupDetails.libraries.map((lib) => ({
          id: lib.id,
          name: lib.name,
          folders:
            backupDetails.libraryFolders.get(lib.id)?.map((f) => f.path) || [],
        }))
      : undefined;

    return {
      ...session,
      availableLibraries,
    };
  }

  @Post('sessions/:id/library')
  @ApiOperation({
    summary: 'Select library (Admin)',
    description: 'Select which library from the backup to restore',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Library selected successfully',
    type: RestoreSuccessMessageDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async selectLibrary(
    @Param('id') sessionId: string,
    @Body() dto: SelectLibraryDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Selecting library ${dto.libraryId}`,
    );

    await this.restoreService.setSelectedLibrary(sessionId, dto.libraryId);

    return {
      success: true,
      message: 'Library selected successfully',
    };
  }

  @Post('sessions/:id/path-mappings')
  @ApiOperation({
    summary: 'Set path mappings (Admin)',
    description:
      'Set path mappings for converting AudioBookShelf paths to Bookmark paths',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Path mappings set successfully',
    type: RestoreSuccessMessageDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async setPathMappings(
    @Param('id') sessionId: string,
    @Body() dto: SetPathMappingsDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Setting ${dto.pathMappings.length} path mappings`,
    );

    this.restoreService.setPathMappings(sessionId, dto.pathMappings);

    return {
      success: true,
      message: 'Path mappings set successfully',
    };
  }

  @Post('sessions/:id/user-mappings')
  @ApiOperation({
    summary: 'Set user mappings (Admin)',
    description:
      'Set user mappings for converting AudioBookShelf users to Bookmark users',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'User mappings set successfully',
    type: RestoreSuccessMessageDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async setUserMappings(
    @Param('id') sessionId: string,
    @Body() dto: SetUserMappingsDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Setting ${dto.userMappings.length} user mappings`,
    );

    this.restoreService.setUserMappings(sessionId, dto.userMappings);

    return {
      success: true,
      message: 'User mappings set successfully',
    };
  }

  @Post('sessions/:id/options')
  @ApiOperation({
    summary: 'Set restore options (Admin)',
    description:
      'Set import options including what data to include in the restore',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Restore options set successfully',
    type: RestoreSuccessMessageDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async setOptions(
    @Param('id') sessionId: string,
    @Body() dto: SetRestoreOptionsDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Setting restore options`,
    );

    this.restoreService.setOptions(sessionId, dto);

    return {
      success: true,
      message: 'Restore options set successfully',
    };
  }

  @Get('sessions/:id/preview')
  @ApiOperation({
    summary: 'Get import preview (Admin)',
    description:
      'Generate a preview of what will be imported based on current session settings',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Import preview with audiobook counts and details',
    type: ImportPreviewDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getPreview(@Param('id') sessionId: string): Promise<ImportPreview> {
    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Generating preview`,
    );

    const preview = await this.restoreService.generatePreview(sessionId);

    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Preview generated - ${preview.audiobooksToImport.count} audiobooks to import`,
    );

    return preview;
  }

  @Post('sessions/:id/execute')
  @ApiOperation({
    summary: 'Execute import (Admin)',
    description:
      'Start the import process. This is an async operation - progress updates are sent via WebSocket.',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({
    status: 200,
    description: 'Import started successfully',
    type: RestoreSuccessMessageDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async executeImport(
    @Param('id') sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`[ABS-RESTORE-API] Session ${sessionId}: Starting import`);

    const session = this.restoreService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Restore session ${sessionId} not found`);
    }

    // Start import asynchronously (don't await)
    this.restoreImporterService
      .executeImport(session)
      .then(() => {
        this.logger.log(
          `[ABS-RESTORE-API] Session ${sessionId}: Import completed successfully`,
        );
      })
      .catch((error) => {
        this.logger.error(
          `[ABS-RESTORE-API] Session ${sessionId}: Import failed:`,
          error,
        );
      });

    return {
      success: true,
      message: 'Import started - check WebSocket for progress updates',
    };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel session (Admin)',
    description: 'Cancel a restore session and clean up temporary files',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: 204, description: 'Session cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async cancelSession(@Param('id') sessionId: string): Promise<void> {
    this.logger.log(`[ABS-RESTORE-API] Session ${sessionId}: Cancelling`);

    await this.restoreService.cancelSession(sessionId);

    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Cancelled successfully`,
    );
  }

  @Get('bookmark-users')
  @ApiOperation({
    summary: 'Get Bookmark users (Admin)',
    description: 'Get list of Bookmark users for user mapping during restore',
  })
  @ApiResponse({
    status: 200,
    description: 'List of Bookmark users',
    type: [BookmarkUserDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getBookmarkUsers(): Promise<
    Array<{ id: string; name: string; email: string }>
  > {
    this.logger.log(`[ABS-RESTORE-API] Fetching Bookmark users for mapping`);

    const users = await this.db
      .select({
        id: authSchema.user.id,
        name: authSchema.user.name,
        email: authSchema.user.email,
      })
      .from(authSchema.user)
      .orderBy(authSchema.user.name);

    this.logger.log(`[ABS-RESTORE-API] Found ${users.length} Bookmark users`);

    return users;
  }
}
