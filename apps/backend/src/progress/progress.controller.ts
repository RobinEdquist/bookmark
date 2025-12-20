import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AuthGuard } from '../common/guards/auth.guard';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  ProgressService,
  type ProgressResponse,
  type ProgressWithAudiobook,
  type ListeningStats,
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
  @ApiResponse({ status: 200, description: 'List of audiobooks with progress' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProgress(
    @Session() session: UserSession,
  ): Promise<ProgressWithAudiobook[]> {
    return this.progressService.getAllProgress(session.user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get listening statistics',
    description:
      'Returns listening statistics for the current user including total time, completed books, and streaks',
  })
  @ApiResponse({ status: 200, description: 'Listening statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getListeningStats(
    @Session() session: UserSession,
  ): Promise<ListeningStats> {
    return this.progressService.getListeningStats(session.user.id);
  }

  @Get(':audiobookId')
  @ApiOperation({
    summary: 'Get progress for an audiobook',
    description:
      'Returns the current listening progress for a specific audiobook. Returns position 0 if no progress exists.',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Progress data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProgress(
    @Param('audiobookId') audiobookId: string,
    @Session() session: UserSession,
  ): Promise<ProgressResponse> {
    const progress = await this.progressService.getProgress(
      session.user.id,
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
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Updated progress' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProgress(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: UpdateProgressDto,
    @Session() session: UserSession,
  ): Promise<ProgressResponse> {
    return this.progressService.updateProgress(
      session.user.id,
      audiobookId,
      dto,
    );
  }

  @Post(':audiobookId/session')
  @ApiOperation({
    summary: 'Record a listening session',
    description:
      'Record a completed listening session with start time, end time, and duration for analytics',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({ status: 201, description: 'Session recorded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSession(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: CreateSessionDto,
    @Session() session: UserSession,
  ): Promise<{ id: string; durationSeconds: number }> {
    return this.progressService.createSession(
      session.user.id,
      audiobookId,
      dto,
    );
  }

  @Post(':audiobookId/hide')
  @ApiOperation({
    summary: 'Hide from continue listening',
    description:
      'Hide an audiobook from the "continue listening" section without marking it as completed',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Audiobook hidden successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async hideProgress(
    @Param('audiobookId') audiobookId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    return this.progressService.hideProgress(session.user.id, audiobookId);
  }
}
