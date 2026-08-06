import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { AudiobookBookmarksService } from './audiobook-bookmarks.service';
import { CreateAudiobookBookmarkDto } from './dto/create-audiobook-bookmark.dto';
import { UpdateAudiobookBookmarkDto } from './dto/update-audiobook-bookmark.dto';
import { AudiobookBookmarkDto } from './dto/audiobook-bookmark-response.dto';

@ApiTags('Audiobook Bookmarks')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('audiobooks/:audiobookId/bookmarks')
@UseGuards(AuthGuard)
export class AudiobookBookmarksController {
  constructor(private readonly bookmarksService: AudiobookBookmarksService) {}

  @Get()
  @ApiOperation({
    summary: 'List bookmarks for an audiobook',
    description:
      "Returns the current user's bookmarks for the audiobook, ordered by position. Bookmarks are personal — other users' bookmarks are never included.",
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'List of bookmarks',
    type: [AudiobookBookmarkDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(
    @Param('audiobookId') audiobookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AudiobookBookmarkDto[]> {
    return this.bookmarksService.list(user.id, audiobookId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a bookmark',
    description:
      'Creates a bookmark at the given position for the current user. Supplying a client-generated ' +
      'id makes the request idempotent: replaying the same create returns the existing bookmark ' +
      'with status 201 instead of inserting a duplicate.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description:
      'Bookmark created (or an idempotent replay of a previous create)',
    type: AudiobookBookmarkDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or position exceeds audiobook duration',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  @ApiResponse({
    status: 409,
    description: 'The supplied bookmark id already belongs to another record',
  })
  async create(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: CreateAudiobookBookmarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AudiobookBookmarkDto> {
    return this.bookmarksService.create(user.id, audiobookId, dto);
  }

  @Patch(':bookmarkId')
  @ApiOperation({
    summary: 'Update a bookmark',
    description:
      'Updates the note and/or position of a bookmark owned by the current user. ' +
      'At least one field must be provided. An empty note clears it. Last write wins.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'bookmarkId',
    description: 'Bookmark UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated bookmark',
    type: AudiobookBookmarkDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, empty body, or position exceeds audiobook duration',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Bookmark or audiobook not found' })
  async update(
    @Param('audiobookId') audiobookId: string,
    @Param('bookmarkId') bookmarkId: string,
    @Body() dto: UpdateAudiobookBookmarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AudiobookBookmarkDto> {
    return this.bookmarksService.update(user.id, audiobookId, bookmarkId, dto);
  }

  @Delete(':bookmarkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a bookmark',
    description:
      'Deletes a bookmark owned by the current user. Returns 404 when the bookmark does not exist ' +
      '(offline replay queues should treat 404 as success).',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'bookmarkId',
    description: 'Bookmark UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Bookmark deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async remove(
    @Param('audiobookId') audiobookId: string,
    @Param('bookmarkId') bookmarkId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.bookmarksService.remove(user.id, audiobookId, bookmarkId);
  }
}
