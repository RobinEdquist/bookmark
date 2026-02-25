import {
  Controller,
  Get,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { UserProfileService } from './user-profile.service';
import {
  UserProfileStatsDto,
  UserProfileActivityDto,
  LibraryProgressResponseDto,
  ListeningHistoryResponseDto,
} from './dto/user-profile-response.dto';

@ApiTags('User Profile')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('user-profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  /**
   * Resolve the target user ID from the :id param.
   * "me" or the caller's own ID resolves to self.
   * Viewing another user's profile requires admin role.
   */
  private resolveUserId(id: string, currentUser: AuthenticatedUser): string {
    if (id === 'me' || id === currentUser.id) {
      return currentUser.id;
    }

    if (currentUser.role !== 'admin') {
      throw new ForbiddenException(
        "Only admins can view other users' profiles",
      );
    }

    return id;
  }

  @Get(':id/stats')
  @ApiOperation({
    summary: 'Get user profile stats',
    description:
      'Returns aggregate statistics for a user including listening time, books completed, and streaks. Use "me" for the current user.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID or "me" for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile stats',
    type: UserProfileStatsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin required to view other users',
  })
  async getStats(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserProfileStatsDto> {
    const userId = this.resolveUserId(id, currentUser);
    return this.userProfileService.getStats(userId);
  }

  @Get(':id/activity')
  @ApiOperation({
    summary: 'Get user activity for contribution graph',
    description:
      'Returns daily listening durations for a given year. Use "me" for the current user.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID or "me" for the current user',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Year to fetch activity for (defaults to current year)',
    example: 2026,
  })
  @ApiResponse({
    status: 200,
    description: 'Daily listening data',
    type: UserProfileActivityDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin required to view other users',
  })
  async getActivity(
    @Param('id') id: string,
    @Query('year') yearParam: string | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserProfileActivityDto> {
    const userId = this.resolveUserId(id, currentUser);
    const year = parseInt(yearParam as string, 10) || new Date().getFullYear();
    return this.userProfileService.getActivity(userId, year);
  }

  @Get(':id/library-progress')
  @ApiOperation({
    summary: 'Get combined library progress',
    description:
      'Returns a paginated, filterable list of audiobook and ebook progress. Use "me" for the current user.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID or "me" for the current user',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['all', 'audiobook', 'ebook'],
    example: 'all',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'in_progress', 'completed'],
    example: 'all',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['recent', 'title', 'progress'],
    example: 'recent',
  })
  @ApiResponse({
    status: 200,
    description: 'Library progress list',
    type: LibraryProgressResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin required to view other users',
  })
  async getLibraryProgress(
    @Param('id') id: string,
    @Query('limit') limitParam: string | undefined,
    @Query('offset') offsetParam: string | undefined,
    @Query('type') type: string | undefined,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<LibraryProgressResponseDto> {
    const userId = this.resolveUserId(id, currentUser);
    const limit = Math.min(
      Math.max(parseInt(limitParam as string, 10) || 20, 1),
      100,
    );
    const offset = Math.max(parseInt(offsetParam as string, 10) || 0, 0);
    const validType = (['all', 'audiobook', 'ebook'] as const).includes(
      type as 'all' | 'audiobook' | 'ebook',
    )
      ? (type as 'all' | 'audiobook' | 'ebook')
      : 'all';
    const validStatus = (['all', 'in_progress', 'completed'] as const).includes(
      status as 'all' | 'in_progress' | 'completed',
    )
      ? (status as 'all' | 'in_progress' | 'completed')
      : 'all';
    const validSort = (['recent', 'title', 'progress'] as const).includes(
      sort as 'recent' | 'title' | 'progress',
    )
      ? (sort as 'recent' | 'title' | 'progress')
      : 'recent';

    return this.userProfileService.getLibraryProgress(
      userId,
      limit,
      offset,
      validType,
      validStatus,
      validSort,
    );
  }

  @Get(':id/listening-history')
  @ApiOperation({
    summary: 'Get listening history',
    description:
      'Returns a paginated reverse-chronological list of listening sessions. Use "me" for the current user.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID or "me" for the current user',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Listening history',
    type: ListeningHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin required to view other users',
  })
  async getListeningHistory(
    @Param('id') id: string,
    @Query('limit') limitParam: string | undefined,
    @Query('offset') offsetParam: string | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ListeningHistoryResponseDto> {
    const userId = this.resolveUserId(id, currentUser);
    const limit = Math.min(
      Math.max(parseInt(limitParam as string, 10) || 20, 1),
      100,
    );
    const offset = Math.max(parseInt(offsetParam as string, 10) || 0, 0);
    return this.userProfileService.getListeningHistory(userId, limit, offset);
  }
}
