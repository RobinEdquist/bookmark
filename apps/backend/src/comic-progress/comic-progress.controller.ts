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
import { UpdateComicProgressDto } from './dto/update-comic-progress.dto';
import { ComicProgressResponseDto } from './dto/comic-progress-response.dto';
import {
  ComicProgressService,
  type ComicProgressResponse,
  type ComicProgressWithBook,
} from './comic-progress.service';

@ApiTags('Comic Progress')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('comic-progress')
@UseGuards(AuthGuard)
export class ComicProgressController {
  constructor(private readonly service: ComicProgressService) {}

  // NOTE: on-deck MUST be declared before :bookId so the literal string
  // 'on-deck' is not captured as a bookId param.
  @Get('on-deck')
  @ApiOperation({ summary: 'Get in-progress comics (Continue Reading)' })
  @ApiResponse({
    status: 200,
    description: 'List of in-progress comics with book metadata',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOnDeck(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicProgressWithBook[]> {
    return this.service.getOnDeck(user.id);
  }

  @Get(':bookId')
  @ApiOperation({ summary: 'Get progress for a comic issue' })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description:
      'Progress data (default values returned when no progress exists)',
    type: ComicProgressResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProgress(
    @Param('bookId') bookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicProgressResponse> {
    const progress = await this.service.getProgress(user.id, bookId);
    if (!progress) {
      // No progress record is a valid state — return sensible defaults
      return {
        comicBookId: bookId,
        currentPage: 0,
        pageCount: 0,
        status: 'unread',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return progress;
  }

  @Patch(':bookId')
  @ApiOperation({ summary: 'Update comic progress' })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Updated progress',
    type: ComicProgressResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async updateProgress(
    @Param('bookId') bookId: string,
    @Body() dto: UpdateComicProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicProgressResponse> {
    return this.service.updateProgress(user.id, bookId, dto);
  }

  @Delete(':bookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset progress for a comic issue' })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Progress reset successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Progress record not found' })
  async resetProgress(
    @Param('bookId') bookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.resetProgress(user.id, bookId);
  }

  @Post(':bookId/hide')
  @ApiOperation({ summary: 'Hide from Continue Reading' })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Issue hidden successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Progress record not found' })
  async hideProgress(
    @Param('bookId') bookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.hideProgress(user.id, bookId);
  }
}
