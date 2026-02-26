import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  ProgressResponseDto,
  ProgressWithAudiobookDto,
  ListeningStatsDto,
  CreateSessionResponseDto,
  MobileListeningStatsDto,
} from './dto/progress-response.dto';
import {
  ProgressService,
  type ProgressResponse,
  type ProgressWithAudiobook,
  type ListeningStats,
  type MobileListeningStats,
} from './progress.service';

@ApiTags('Progress')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all in-progress audiobooks',
    description:
      'Returns all audiobooks that the current user has started but not completed, ordered by last activity',
  })
  @ApiResponse({
    status: 200,
    description: 'List of audiobooks with progress',
    type: [ProgressWithAudiobookDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProgress(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProgressWithAudiobook[]> {
    return this.progressService.getAllProgress(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get listening statistics',
    description:
      'Returns listening statistics for the current user including total time, completed books, and streaks',
  })
  @ApiResponse({
    status: 200,
    description: 'Listening statistics',
    type: ListeningStatsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getListeningStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListeningStats> {
    return this.progressService.getListeningStats(user.id);
  }

  @Get('listening-stats')
  @ApiOperation({
    summary: 'Get mobile-friendly listening statistics',
    description:
      'Returns listening stats with daily breakdowns for contribution graphs and per-audiobook stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Mobile listening statistics',
    type: MobileListeningStatsDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMobileListeningStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MobileListeningStats> {
    return this.progressService.getMobileListeningStats(user.id);
  }

  @Get(':audiobookId')
  @ApiOperation({
    summary: 'Get progress for an audiobook',
    description:
      'Returns the current listening progress for a specific audiobook. Returns position 0 if no progress exists.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress data',
    type: ProgressResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProgress(
    @Param('audiobookId') audiobookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProgressResponse> {
    const progress = await this.progressService.getProgress(
      user.id,
      audiobookId,
    );
    if (!progress) {
      // Return default progress - no progress is a valid state, not an error
      return {
        audiobookId,
        position: 0,
        completed: false,
        completedAt: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return progress;
  }

  @Patch(':audiobookId')
  @ApiOperation({
    summary: 'Update audiobook progress',
    description:
      'Update the listening position for an audiobook. Creates progress record if it does not exist.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated progress',
    type: ProgressResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProgress(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProgressResponse> {
    return this.progressService.updateProgress(user.id, audiobookId, dto);
  }

  @Post(':audiobookId/session')
  @ApiOperation({
    summary: 'Record a listening session',
    description:
      'Record a completed listening session with start time, end time, and duration for analytics',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Session recorded successfully',
    type: CreateSessionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSession(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; durationSeconds: number }> {
    return this.progressService.createSession(user.id, audiobookId, dto);
  }

  @Delete(':audiobookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset progress for an audiobook',
    description:
      'Deletes the listening progress for a specific audiobook. Listening sessions are preserved. This action cannot be undone.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Progress reset successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Progress record not found' })
  async resetProgress(
    @Param('audiobookId') audiobookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.progressService.resetProgress(user.id, audiobookId);
  }

  @Post(':audiobookId/hide')
  @ApiOperation({
    summary: 'Hide from continue listening',
    description:
      'Hide an audiobook from the "continue listening" section without marking it as completed',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Audiobook hidden successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async hideProgress(
    @Param('audiobookId') audiobookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.progressService.hideProgress(user.id, audiobookId);
  }
}
