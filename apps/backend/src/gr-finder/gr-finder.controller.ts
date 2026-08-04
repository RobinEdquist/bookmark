import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { GrFinderService, type MediaType } from './gr-finder.service';
import { GoodreadsLinkQueueService } from './goodreads-link-queue.service';
import {
  GrFinderSearchResponseDto,
  GrFinderBookDetailsDto,
  GrFinderStatusResponseDto,
  GrFinderLinkResponseDto,
  GrFinderLinkQueuedResponseDto,
  GoodreadsLinkTaskStatusDto,
} from './dto/gr-finder-response.dto';
import { LinkGoodreadsDto } from './dto/link-goodreads.dto';

@ApiTags('Goodreads Finder')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('gr-finder')
@UseGuards(RolesGuard)
@Roles('admin')
export class GrFinderController {
  constructor(
    private readonly grFinderService: GrFinderService,
    private readonly linkQueue: GoodreadsLinkQueueService,
  ) {}

  /**
   * Validates the request up front so a bad id or missing Goodreads ID is
   * answered here, then hands the slow part to the background queue.
   */
  private async queueLink(
    mediaType: MediaType,
    mediaId: string,
    dto: LinkGoodreadsDto,
  ): Promise<GrFinderLinkQueuedResponseDto> {
    if (!dto.goodreadsId) {
      throw new BadRequestException('Goodreads ID is required');
    }

    await this.grFinderService.assertMediaExists(mediaType, mediaId);

    const { jobId } = this.linkQueue.enqueue({
      mediaType,
      mediaId,
      goodreadsId: dto.goodreadsId,
      ...(dto.searchResult ? { searchResult: dto.searchResult } : {}),
    });

    return { queued: true, jobId };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get Goodreads Finder availability',
    description:
      'Goodreads lookups are built into the server; reports availability for the current (admin) user',
  })
  @ApiResponse({
    status: 200,
    description: 'Integration status',
    type: GrFinderStatusResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getStatus(): GrFinderStatusResponseDto {
    return {
      configured: true,
    };
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search Goodreads for books',
    description: 'Search Goodreads for books matching the query',
  })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: GrFinderSearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Search query required',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async search(@Query('q') query: string): Promise<GrFinderSearchResponseDto> {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Search query is required');
    }

    try {
      return await this.grFinderService.search(query);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Search failed',
      );
    }
  }

  @Get('search/audiobook/:audiobookId')
  @ApiOperation({
    summary: 'Search Goodreads by audiobook',
    description:
      'Search Goodreads using audiobook metadata (title, subtitle, authors)',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Custom search query' })
  @ApiResponse({
    status: 200,
    description: 'Search results with computed query',
    type: GrFinderSearchResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async searchByAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Query('q') customQuery?: string,
  ): Promise<GrFinderSearchResponseDto> {
    try {
      return await this.grFinderService.searchByMediaId(
        'audiobook',
        audiobookId,
        customQuery,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Search failed',
      );
    }
  }

  @Get('search/ebook/:ebookId')
  @ApiOperation({
    summary: 'Search Goodreads by ebook',
    description:
      'Search Goodreads using ebook metadata (title, subtitle, authors)',
  })
  @ApiParam({
    name: 'ebookId',
    description: 'Ebook UUID',
    format: 'uuid',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Custom search query' })
  @ApiResponse({
    status: 200,
    description: 'Search results with computed query',
    type: GrFinderSearchResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async searchByEbook(
    @Param('ebookId') ebookId: string,
    @Query('q') customQuery?: string,
  ): Promise<GrFinderSearchResponseDto> {
    try {
      return await this.grFinderService.searchByMediaId(
        'ebook',
        ebookId,
        customQuery,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Search failed',
      );
    }
  }

  @Get('book/:goodreadsId')
  @ApiOperation({
    summary: 'Get Goodreads book details',
    description:
      'Fetch full details for a Goodreads book including description and genres',
  })
  @ApiParam({
    name: 'goodreadsId',
    description: 'Goodreads book ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Book details',
    type: GrFinderBookDetailsDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({
    status: 503,
    description: 'Goodreads book page could not be read — retry',
  })
  async getBookDetails(
    @Param('goodreadsId') goodreadsId: string,
  ): Promise<GrFinderBookDetailsDto> {
    try {
      return await this.grFinderService.getBookDetails(goodreadsId);
    } catch (error) {
      // Pass through any deliberate status (503 for an unreadable page, 404,
      // 400) instead of flattening it to a 500.
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to fetch book details',
      );
    }
  }

  // ============ Audiobook Link Endpoints ============

  @Get('link/:audiobookId')
  @ApiOperation({
    summary: 'Get audiobook Goodreads link',
    description: 'Get the Goodreads book linked to an audiobook',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Goodreads link data',
    type: GrFinderLinkResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getAudiobookLink(
    @Param('audiobookId') audiobookId: string,
  ): Promise<GrFinderLinkResponseDto> {
    const link = await this.grFinderService.getGoodreadsLink(
      'audiobook',
      audiobookId,
    );
    return { link };
  }

  @Post('link/:audiobookId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue an audiobook Goodreads link',
    description:
      'Queues the link and returns immediately. Reading the Goodreads book page can take minutes, so the work runs in the background and its progress is reported via GET /tasks/status and the tasks.goodreads.status WebSocket event.',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 202,
    description: 'Link queued',
    type: GrFinderLinkQueuedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Goodreads ID required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async linkAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: LinkGoodreadsDto,
  ): Promise<GrFinderLinkQueuedResponseDto> {
    return this.queueLink('audiobook', audiobookId, dto);
  }

  @Delete('link/:audiobookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink audiobook from Goodreads',
    description: 'Remove the Goodreads link from an audiobook',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkAudiobook(
    @Param('audiobookId') audiobookId: string,
  ): Promise<void> {
    await this.grFinderService.unlinkMedia('audiobook', audiobookId);
  }

  // ============ Link Queue Endpoints ============

  @Get('link-jobs')
  @ApiOperation({
    summary: 'Get Goodreads link queue status',
    description:
      'Active job, queue depth and remembered failures for background Goodreads links',
  })
  @ApiResponse({
    status: 200,
    description: 'Link queue status',
    type: GoodreadsLinkTaskStatusDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getLinkJobs(): GoodreadsLinkTaskStatusDto {
    return this.linkQueue.getStatus();
  }

  @Delete('link-jobs/failed')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss failed Goodreads links',
    description: 'Clears remembered link failures so they leave the task list',
  })
  @ApiResponse({ status: 204, description: 'Failures dismissed' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  dismissFailedLinkJobs(): void {
    this.linkQueue.dismissFailures();
  }

  // ============ Ebook Link Endpoints ============

  @Get('ebook-link/:ebookId')
  @ApiOperation({
    summary: 'Get ebook Goodreads link',
    description: 'Get the Goodreads book linked to an ebook',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Goodreads link data',
    type: GrFinderLinkResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getEbookLink(
    @Param('ebookId') ebookId: string,
  ): Promise<GrFinderLinkResponseDto> {
    const link = await this.grFinderService.getGoodreadsLink('ebook', ebookId);
    return { link };
  }

  @Post('ebook-link/:ebookId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue an ebook Goodreads link',
    description:
      'Queues the link and returns immediately. Reading the Goodreads book page can take minutes, so the work runs in the background and its progress is reported via GET /tasks/status and the tasks.goodreads.status WebSocket event.',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({
    status: 202,
    description: 'Link queued',
    type: GrFinderLinkQueuedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Goodreads ID required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async linkEbook(
    @Param('ebookId') ebookId: string,
    @Body() dto: LinkGoodreadsDto,
  ): Promise<GrFinderLinkQueuedResponseDto> {
    return this.queueLink('ebook', ebookId, dto);
  }

  @Delete('ebook-link/:ebookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink ebook from Goodreads',
    description: 'Remove the Goodreads link from an ebook',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkEbook(@Param('ebookId') ebookId: string): Promise<void> {
    await this.grFinderService.unlinkMedia('ebook', ebookId);
  }
}
