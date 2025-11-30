import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
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

@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * Get all in-progress audiobooks for the current user
   */
  @Get()
  async getAllProgress(@Session() session: UserSession): Promise<ProgressWithAudiobook[]> {
    return this.progressService.getAllProgress(session.user.id);
  }

  /**
   * Get listening statistics for the current user
   */
  @Get('stats')
  async getListeningStats(@Session() session: UserSession): Promise<ListeningStats> {
    return this.progressService.getListeningStats(session.user.id);
  }

  /**
   * Get progress for a specific audiobook
   * Returns position 0 if no progress exists (not an error state)
   */
  @Get(':audiobookId')
  async getProgress(
    @Param('audiobookId') audiobookId: string,
    @Session() session: UserSession,
  ): Promise<ProgressResponse> {
    const progress = await this.progressService.getProgress(session.user.id, audiobookId);
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

  /**
   * Update progress for an audiobook (upsert)
   */
  @Patch(':audiobookId')
  async updateProgress(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: UpdateProgressDto,
    @Session() session: UserSession,
  ): Promise<ProgressResponse> {
    return this.progressService.updateProgress(session.user.id, audiobookId, dto);
  }

  /**
   * Record a listening session
   */
  @Post(':audiobookId/session')
  async createSession(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: CreateSessionDto,
    @Session() session: UserSession,
  ): Promise<{ id: string; durationSeconds: number }> {
    return this.progressService.createSession(session.user.id, audiobookId, dto);
  }
}
