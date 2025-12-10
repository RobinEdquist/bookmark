import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Roles, RolesGuard } from '../auth/roles.guard';
import {
  FilesystemService,
  BrowseResult,
  DirectoryInfo,
} from './filesystem.service';

@Controller('filesystem')
@UseGuards(RolesGuard)
@Roles('admin')
export class FilesystemController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Get('browse')
  async browse(@Query('path') dirPath?: string): Promise<BrowseResult> {
    const targetPath =
      dirPath || (await this.filesystemService.getInitialPath());
    return this.filesystemService.browse(targetPath);
  }

  @Post('create-directory')
  async createDirectory(@Body('path') dirPath: string): Promise<DirectoryInfo> {
    if (!dirPath) {
      throw new BadRequestException('Path is required');
    }
    return this.filesystemService.createDirectory(dirPath);
  }
}
