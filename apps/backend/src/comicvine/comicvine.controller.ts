import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ComicvineService } from './comicvine.service';
import { SuccessResponseDto } from '../common/dto';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { CvVolumeRaw, CvIssueRaw } from './dto/comicvine.dto';

interface ValidateKeyDto {
  apiKey: string;
}

interface SetAutoSyncDto {
  enabled: boolean;
}

interface LinkSeriesDto {
  volume: CvVolumeRaw;
}

interface LinkBookDto {
  issue: CvIssueRaw;
}

@ApiTags('ComicVine')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('comicvine')
@UseGuards(RolesGuard)
@Roles('admin')
export class ComicvineController {
  constructor(private readonly comicvineService: ComicvineService) {}

  // ============ Status / Configuration ============

  @Get('status')
  @ApiOperation({
    summary: 'Get ComicVine integration status',
    description:
      'Returns whether ComicVine API is configured and auto-sync settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Integration status',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getStatus() {
    const [apiKey, autoSyncOnImport] = await Promise.all([
      this.comicvineService.getApiKey(),
      this.comicvineService.getAutoSyncOnImport(),
    ]);
    return {
      configured: !!apiKey,
      autoSyncOnImport,
    };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate and save ComicVine API key',
    description: 'Validate a ComicVine API key and save it if valid',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
  })
  @ApiResponse({ status: 400, description: 'API key is required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async validateKey(@Body() dto: ValidateKeyDto) {
    if (!dto.apiKey || typeof dto.apiKey !== 'string') {
      throw new BadRequestException('API key is required');
    }

    const result = await this.comicvineService.validateApiKey(dto.apiKey);

    if (result.valid) {
      await this.comicvineService.setApiKey(dto.apiKey);
    }

    return result;
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect from ComicVine',
    description:
      'Remove the stored API key and disconnect the ComicVine integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Disconnected successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async disconnect() {
    await this.comicvineService.setApiKey(null);
    return { success: true };
  }

  @Post('auto-sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set auto-sync setting',
    description:
      'Enable or disable automatic syncing of new comic imports to ComicVine',
  })
  @ApiResponse({
    status: 200,
    description: 'Setting updated',
  })
  @ApiResponse({ status: 400, description: 'Invalid enabled value' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async setAutoSync(@Body() dto: SetAutoSyncDto) {
    if (typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }

    await this.comicvineService.setAutoSyncOnImport(dto.enabled);
    return { success: true, autoSyncOnImport: dto.enabled };
  }

  // ============ Volume Search ============

  @Get('search/volumes')
  @ApiOperation({
    summary: 'Search ComicVine volumes',
    description: 'Search for comic volumes on ComicVine by title',
  })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
  })
  @ApiResponse({
    status: 400,
    description: 'Search query required or API error',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async searchVolumes(@Query('q') query: string, @Query('page') page?: string) {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Search query is required');
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    return this.comicvineService.searchVolumes(query, pageNum);
  }

  @Get('search/volume-for-series/:seriesId')
  @ApiOperation({
    summary: 'Search ComicVine volumes for a series',
    description: 'Search ComicVine using the series title as a prefilled query',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Comic series UUID',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results prefilled from series title',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async searchVolumeForSeries(
    @Param('seriesId') seriesId: string,
    @Query('page') page?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;

    // Load the series title from the service
    const seriesLink = await this.comicvineService.getSeriesLink(seriesId);

    // Fall back to a plain series title search via service-level context
    // We need the series title — load it by attempting match which returns the title.
    // Since this is a search-prefill endpoint, we call searchVolumes with any
    // cached title. Use a dedicated helper in the service.
    const result = await this.comicvineService.searchVolumesForSeries(
      seriesId,
      pageNum,
    );

    return { ...result, currentLink: seriesLink };
  }

  // ============ Volume Issues ============

  @Get('volume/:cvVolumeId/issues')
  @ApiOperation({
    summary: 'Get issues for a ComicVine volume',
    description:
      'Fetch and cache issues for a specific ComicVine volume (for manual book matching)',
  })
  @ApiParam({
    name: 'cvVolumeId',
    description: 'ComicVine volume ID (numeric)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'Issues for the volume',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getVolumeIssues(
    @Param('cvVolumeId') cvVolumeId: string,
    @Query('page') page?: string,
  ) {
    const volumeId = parseInt(cvVolumeId, 10);
    if (isNaN(volumeId)) {
      throw new BadRequestException('cvVolumeId must be a number');
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    return this.comicvineService.getVolumeIssuesPaged(volumeId, pageNum);
  }

  // ============ Series Links ============

  @Get('link/series/:seriesId')
  @ApiOperation({
    summary: 'Get series ComicVine link',
    description: 'Get the ComicVine volume linked to a comic series',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Comic series UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'ComicVine series link data',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getSeriesLink(@Param('seriesId') seriesId: string) {
    const link = await this.comicvineService.getSeriesLink(seriesId);
    return { link };
  }

  @Post('link/series/:seriesId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link series to ComicVine volume',
    description: 'Link a comic series to a ComicVine volume for metadata sync',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Comic series UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
  })
  @ApiResponse({ status: 400, description: 'Volume data required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async linkSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: LinkSeriesDto,
  ) {
    if (!dto.volume || typeof dto.volume.id !== 'number') {
      throw new BadRequestException('Volume data with id is required');
    }

    const link = await this.comicvineService.linkSeriesToVolume(
      seriesId,
      dto.volume,
    );

    return { success: true, link };
  }

  @Delete('link/series/:seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink series from ComicVine',
    description: 'Remove the ComicVine volume link from a comic series',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Comic series UUID',
    format: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkSeries(@Param('seriesId') seriesId: string) {
    await this.comicvineService.unlinkSeries(seriesId);
  }

  // ============ Book Links ============

  @Get('link/book/:bookId')
  @ApiOperation({
    summary: 'Get book ComicVine link',
    description: 'Get the ComicVine issue linked to a comic book',
  })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'ComicVine book link data',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getBookLink(@Param('bookId') bookId: string) {
    const link = await this.comicvineService.getBookLink(bookId);
    return { link };
  }

  @Post('link/book/:bookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link book to ComicVine issue',
    description: 'Link a comic book to a ComicVine issue for metadata sync',
  })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
  })
  @ApiResponse({ status: 400, description: 'Issue data required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async linkBook(@Param('bookId') bookId: string, @Body() dto: LinkBookDto) {
    if (!dto.issue || typeof dto.issue.id !== 'number') {
      throw new BadRequestException('Issue data with id is required');
    }

    const link = await this.comicvineService.linkBookToIssue(bookId, dto.issue);

    return { success: true, link };
  }

  @Delete('link/book/:bookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink book from ComicVine',
    description: 'Remove the ComicVine issue link from a comic book',
  })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkBook(@Param('bookId') bookId: string) {
    await this.comicvineService.unlinkBook(bookId);
  }

  // ============ Issue Search ============

  @Get('search/issue-for-book/:bookId')
  @ApiOperation({
    summary: 'Search ComicVine issues for a book',
    description:
      'Search for ComicVine issues for a comic book using the linked volume',
  })
  @ApiParam({ name: 'bookId', description: 'Comic book UUID', format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'Issues for the book (from linked volume)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async searchIssueForBook(
    @Param('bookId') bookId: string,
    @Query('page') page?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    return this.comicvineService.searchIssuesForBook(bookId, pageNum);
  }

  // ============ Sync Queue ============

  @Get('queue/status')
  @ApiOperation({
    summary: 'Get ComicVine sync queue status',
    description:
      'Get the status of the ComicVine sync queue including pending, needs-review, and failed items',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue status',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getQueueStatus() {
    const [pendingCount, items] = await Promise.all([
      this.comicvineService.getPendingCount(),
      this.comicvineService.getQueueItems(),
    ]);

    const needsReviewItems = items.filter((i) => i.status === 'needs_review');
    const failedItems = items.filter((i) => i.status === 'failed');

    return {
      pendingCount,
      needsReviewCount: needsReviewItems.length,
      failedCount: failedItems.length,
      items,
    };
  }

  @Delete('queue/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss a queue item',
    description: 'Remove a failed or needs-review item from the sync queue',
  })
  @ApiParam({ name: 'id', description: 'Queue item ID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Item dismissed' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async dismissItem(@Param('id') id: string) {
    await this.comicvineService.dismissItem(id);
  }

  @Post('queue-all-unlinked/series')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue all unlinked series',
    description:
      'Add all comic series without ComicVine volume links to the sync queue',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of items queued',
  })
  @ApiResponse({ status: 400, description: 'ComicVine API key not configured' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async queueAllUnlinkedSeries() {
    const queuedCount = await this.comicvineService.queueAllUnlinkedSeries();
    return { queuedCount };
  }
}
