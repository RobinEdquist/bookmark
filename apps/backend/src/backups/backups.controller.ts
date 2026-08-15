import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs/promises';
import { AdminGuard } from '../common/guards/admin.guard';
import { BackupsService } from './backups.service';
import {
  BackupConfigDto,
  BackupEntryDto,
  BackupOverviewDto,
  RestoreBackupResponseDto,
} from './dto/backup-response.dto';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';

@ApiTags('Backups')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/backups')
@UseGuards(AdminGuard)
export class BackupsController {
  private readonly logger = new Logger(BackupsController.name);

  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'List backups and backup configuration (Admin)' })
  @ApiResponse({ status: 200, type: BackupOverviewDto })
  getBackups(): Promise<BackupOverviewDto> {
    return this.backupsService.getOverview();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update backup configuration (Admin)' })
  @ApiResponse({ status: 200, type: BackupConfigDto })
  updateConfig(@Body() dto: UpdateBackupConfigDto): Promise<BackupConfigDto> {
    return this.backupsService.updateConfig(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a backup now (Admin)' })
  @ApiResponse({
    status: 201,
    description: 'Backup created',
    type: BackupEntryDto,
  })
  createBackup(): Promise<BackupEntryDto> {
    return this.backupsService.createBackup();
  }

  @Post('upload')
  @UseInterceptors(
    // The staging destination comes from the MulterModule registration in
    // BackupsModule (app-data temp), so a 5GB upload never lands in the
    // container's root filesystem.
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 5 * 1024 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload a Bookmark backup archive (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: BackupEntryDto })
  async uploadBackup(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BackupEntryDto> {
    if (!file || !file.originalname.toLowerCase().endsWith('.bookmark')) {
      if (file?.path) await fs.rm(file.path, { force: true });
      throw new BadRequestException('A .bookmark backup file is required');
    }

    try {
      return await this.backupsService.importBackup(file.path);
    } finally {
      await fs.rm(file.path, { force: true });
    }
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a backup archive (Admin)' })
  async downloadBackup(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const backup = await this.backupsService.getBackupFile(id);
    response.download(backup.fullPath, backup.filename, (error) => {
      if (!error) return;
      // Without this callback, sendfile errors (e.g. the archive was pruned
      // by retention between listing and streaming) bypass the exception
      // filter and surface as Express's default HTML 500.
      this.logger.warn(`Backup download failed: ${error.message}`);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      response.status(missing ? 404 : 500).json(
        missing
          ? {
              message: 'Backup not found',
              error: 'Not Found',
              statusCode: 404,
            }
          : { message: 'Internal server error', statusCode: 500 },
      );
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup archive (Admin)' })
  @ApiResponse({ status: 204, description: 'Backup deleted' })
  async deleteBackup(@Param('id') id: string): Promise<void> {
    await this.backupsService.deleteBackup(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Restore a backup and restart Bookmark (Admin)',
    description:
      'After a successful restore the backend terminates itself so the ' +
      'process supervisor (the Docker restart policy in the standard ' +
      'deployment) brings it back up against the restored database. Without ' +
      'a supervisor the process must be started again manually.',
  })
  @ApiResponse({ status: 202, type: RestoreBackupResponseDto })
  async restoreBackup(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RestoreBackupResponseDto> {
    await this.backupsService.restoreBackup(id);

    // Restart only after the response has actually left the process, so the
    // client never sees a connection reset instead of the 202. 'close' covers
    // clients that disconnect before the response finishes flushing.
    let scheduled = false;
    const scheduleRestart = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 1000).unref();
    };
    response.once('finish', scheduleRestart);
    response.once('close', scheduleRestart);

    return { restored: true, restartRequired: true };
  }
}
