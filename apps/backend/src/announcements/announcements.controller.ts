import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Announcements')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('active')
  @ApiOperation({
    summary: 'Get active announcements',
    description:
      'Returns all active announcements that the current user has not dismissed',
  })
  @ApiResponse({ status: 200, description: 'List of active announcements' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getActive(@CurrentUser() user: AuthenticatedUser) {
    return this.announcementsService.getActiveForUser(user.id);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss an announcement',
    description: 'Mark an announcement as dismissed for the current user',
  })
  @ApiParam({ name: 'id', description: 'Announcement ID' })
  @ApiResponse({ status: 200, description: 'Announcement dismissed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async dismiss(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.announcementsService.dismiss(id, user.id);
  }
}
