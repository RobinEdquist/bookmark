import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { GenresAdminService } from './genres-admin.service';
import { RenameGenreDto } from './dto/rename-genre.dto';
import type { AdminGenresResponseDto } from './dto/admin-genre.dto';

@ApiTags('Genres Admin')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AdminGuard)
@Controller('admin/genres')
export class GenresAdminController {
  constructor(private readonly genresAdminService: GenresAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'List all genres',
    description: 'Returns all genres with audiobook and ebook counts',
  })
  @ApiResponse({ status: 200, description: 'List of all genres with counts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAll(): Promise<AdminGenresResponseDto> {
    const genres = await this.genresAdminService.findAll();
    return { genres };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename genre',
    description:
      'Rename a genre. Returns conflict info if name already exists.',
  })
  @ApiParam({ name: 'id', description: 'Genre ID' })
  @ApiResponse({ status: 200, description: 'Genre renamed or conflict info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async rename(@Param('id') id: string, @Body() dto: RenameGenreDto) {
    return this.genresAdminService.rename(id, dto.name);
  }

  @Post(':id/merge/:targetId')
  @ApiOperation({
    summary: 'Merge genres',
    description: 'Merge source genre into target genre',
  })
  @ApiParam({ name: 'id', description: 'Source genre ID (will be deleted)' })
  @ApiParam({ name: 'targetId', description: 'Target genre ID (will remain)' })
  @ApiResponse({ status: 200, description: 'Genres merged successfully' })
  @ApiResponse({ status: 400, description: 'Cannot merge genre with itself' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async merge(
    @Param('id') sourceId: string,
    @Param('targetId') targetId: string,
  ) {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge genre with itself');
    }
    return this.genresAdminService.merge(sourceId, targetId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete genre',
    description: 'Delete a genre and remove all associations',
  })
  @ApiParam({ name: 'id', description: 'Genre ID' })
  @ApiResponse({ status: 204, description: 'Genre deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Genre not found' })
  async delete(@Param('id') id: string) {
    await this.genresAdminService.delete(id);
  }
}
