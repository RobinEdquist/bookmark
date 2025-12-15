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
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as authSchema from '../auth/schema';

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

  /**
   * POST /api/admin/restore/upload
   * Upload an AudioBookShelf backup file and create a restore session
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
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

  /**
   * GET /api/admin/restore/sessions/:id
   * Get the current status and details of a restore session
   */
  @Get('sessions/:id')
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

  /**
   * POST /api/admin/restore/sessions/:id/library
   * Select which library to restore from the backup
   */
  @Post('sessions/:id/library')
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

  /**
   * POST /api/admin/restore/sessions/:id/path-mappings
   * Set path mappings for converting ABS paths to SAV paths
   */
  @Post('sessions/:id/path-mappings')
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

  /**
   * POST /api/admin/restore/sessions/:id/user-mappings
   * Set user mappings for converting ABS users to SAV users
   */
  @Post('sessions/:id/user-mappings')
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

  /**
   * POST /api/admin/restore/sessions/:id/options
   * Set import options (what to include in the restore)
   */
  @Post('sessions/:id/options')
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

  /**
   * GET /api/admin/restore/sessions/:id/preview
   * Generate a preview of what will be imported
   */
  @Get('sessions/:id/preview')
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

  /**
   * POST /api/admin/restore/sessions/:id/execute
   * Start the import process (async operation)
   */
  @Post('sessions/:id/execute')
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

  /**
   * DELETE /api/admin/restore/sessions/:id
   * Cancel a restore session and clean up temporary files
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelSession(@Param('id') sessionId: string): Promise<void> {
    this.logger.log(`[ABS-RESTORE-API] Session ${sessionId}: Cancelling`);

    await this.restoreService.cancelSession(sessionId);

    this.logger.log(
      `[ABS-RESTORE-API] Session ${sessionId}: Cancelled successfully`,
    );
  }

  /**
   * GET /api/admin/restore/bookmark-users
   * Get list of Bookmark users for mapping
   */
  @Get('bookmark-users')
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
