import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import * as os from 'os';
import { AdminGuard } from '../common/guards/admin.guard';
import { BackupsService } from './backups.service';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';

@ApiTags('Backups')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/backups')
@UseGuards(AdminGuard)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'List backups and backup configuration (Admin)' })
  async getBackups() {
    const [config, backups] = await Promise.all([
      this.backupsService.getConfig(),
      this.backupsService.listBackups(),
    ]);
    return { config, backups };
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update backup configuration (Admin)' })
  updateConfig(@Body() dto: UpdateBackupConfigDto) {
    return this.backupsService.updateConfig(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a backup now (Admin)' })
  @ApiResponse({ status: 201, description: 'Backup created' })
  createBackup() {
    return this.backupsService.createBackup();
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: os.tmpdir(),
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
  async uploadBackup(@UploadedFile() file: Express.Multer.File) {
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
    response.download(backup.fullPath, backup.filename);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup archive (Admin)' })
  async deleteBackup(@Param('id') id: string): Promise<void> {
    await this.backupsService.deleteBackup(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Restore a backup and restart Bookmark (Admin)' })
  async restoreBackup(@Param('id') id: string) {
    await this.backupsService.restoreBackup(id);
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 1000).unref();
    return { restored: true, restartRequired: true };
  }
}
