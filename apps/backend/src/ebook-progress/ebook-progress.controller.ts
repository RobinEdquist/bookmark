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
import { UpdateEbookProgressDto } from './dto/update-ebook-progress.dto';
import {
  EbookProgressResponseDto,
  EbookProgressWithEbookDto,
} from './dto/ebook-progress-response.dto';
import {
  EbookProgressService,
  type EbookProgressResponse,
  type EbookProgressWithEbook,
} from './ebook-progress.service';

@ApiTags('Ebook Progress')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('ebook-progress')
@UseGuards(AuthGuard)
export class EbookProgressController {
  constructor(private readonly ebookProgressService: EbookProgressService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all in-progress ebooks',
    description:
      'Returns all ebooks that the current user has started but not completed, ordered by last activity',
  })
  @ApiResponse({
    status: 200,
    description: 'List of ebooks with progress',
    type: [EbookProgressWithEbookDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllProgress(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EbookProgressWithEbook[]> {
    return this.ebookProgressService.getAllProgress(user.id);
  }

  @Get(':ebookId')
  @ApiOperation({
    summary: 'Get progress for an ebook',
    description:
      'Returns the current reading progress for a specific ebook. Returns default values if no progress exists.',
  })
  @ApiParam({
    name: 'ebookId',
    description: 'Ebook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress data',
    type: EbookProgressResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProgress(
    @Param('ebookId') ebookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EbookProgressResponse> {
    const progress = await this.ebookProgressService.getProgress(
      user.id,
      ebookId,
    );
    if (!progress) {
      // Return default progress - no progress is a valid state, not an error
      return {
        ebookId,
        cfi: null,
        progressPercent: 0,
        completed: false,
        completedAt: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return progress;
  }

  @Patch(':ebookId')
  @ApiOperation({
    summary: 'Update ebook progress',
    description:
      'Update the reading position for an ebook. Creates progress record if it does not exist.',
  })
  @ApiParam({
    name: 'ebookId',
    description: 'Ebook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated progress',
    type: EbookProgressResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async updateProgress(
    @Param('ebookId') ebookId: string,
    @Body() dto: UpdateEbookProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EbookProgressResponse> {
    return this.ebookProgressService.updateProgress(user.id, ebookId, dto);
  }

  @Delete(':ebookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset progress for an ebook',
    description:
      'Deletes all reading progress for a specific ebook. This action cannot be undone.',
  })
  @ApiParam({
    name: 'ebookId',
    description: 'Ebook UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Progress reset successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Progress record not found' })
  async resetProgress(
    @Param('ebookId') ebookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.ebookProgressService.resetProgress(user.id, ebookId);
  }

  @Post(':ebookId/hide')
  @ApiOperation({
    summary: 'Hide from continue reading',
    description:
      'Hide an ebook from the "continue reading" section without marking it as completed',
  })
  @ApiParam({
    name: 'ebookId',
    description: 'Ebook UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Ebook hidden successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Progress record not found' })
  async hideProgress(
    @Param('ebookId') ebookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.ebookProgressService.hideProgress(user.id, ebookId);
  }
}
