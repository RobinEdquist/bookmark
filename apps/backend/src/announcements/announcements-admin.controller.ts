import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@ApiTags('Announcements Admin')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AdminGuard)
@Controller('admin/announcements')
export class AnnouncementsAdminController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all announcements',
    description: 'Returns all announcements (active and inactive)',
  })
  @ApiResponse({ status: 200, description: 'List of all announcements' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAll() {
    return this.announcementsService.findAll();
  }

  @Post()
  @ApiOperation({
    summary: 'Create announcement',
    description: 'Create a new announcement',
  })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.announcementsService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update announcement',
    description: 'Update an existing announcement',
  })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({ status: 200, description: 'Announcement updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete announcement',
    description: 'Delete an announcement and all its dismissals',
  })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({ status: 204, description: 'Announcement deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async delete(@Param('id') id: string) {
    await this.announcementsService.delete(id);
  }
}
