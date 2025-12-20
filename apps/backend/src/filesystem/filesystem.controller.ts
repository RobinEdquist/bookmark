import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard';
import {
  FilesystemService,
  BrowseResult,
  DirectoryInfo,
} from './filesystem.service';

@ApiTags('Filesystem')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('filesystem')
@UseGuards(RolesGuard)
@Roles('admin')
export class FilesystemController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Get('browse')
  @ApiOperation({
    summary: 'Browse filesystem (Admin)',
    description:
      'Browse the server filesystem to select library paths. Requires admin role.',
  })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Directory path to browse (defaults to initial path)',
  })
  @ApiResponse({
    status: 200,
    description: 'Directory listing with files and subdirectories',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async browse(@Query('path') dirPath?: string): Promise<BrowseResult> {
    const targetPath =
      dirPath || (await this.filesystemService.getInitialPath());
    return this.filesystemService.browse(targetPath);
  }

  @Post('create-directory')
  @ApiOperation({
    summary: 'Create directory (Admin)',
    description:
      'Create a new directory on the server filesystem. Requires admin role.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full path for new directory' },
      },
      required: ['path'],
    },
  })
  @ApiResponse({ status: 200, description: 'Directory created successfully' })
  @ApiResponse({ status: 400, description: 'Path is required or invalid' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async createDirectory(@Body('path') dirPath: string): Promise<DirectoryInfo> {
    if (!dirPath) {
      throw new BadRequestException('Path is required');
    }
    return this.filesystemService.createDirectory(dirPath);
  }
}
