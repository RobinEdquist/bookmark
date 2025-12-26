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
import { HardcoverService } from './hardcover.service';
import {
  HardcoverStatusResponseDto,
  HardcoverAutoSyncResponseDto,
  HardcoverValidateResponseDto,
  HardcoverSearchResponseDto,
  HardcoverLinkResponseDto,
  HardcoverLinkCreatedResponseDto,
  HardcoverQueueStatusResponseDto,
  HardcoverQueueCountResponseDto,
} from './dto/hardcover-response.dto';
import { SuccessResponseDto } from '../common/dto';
import { Roles, RolesGuard } from '../auth/roles.guard';

interface ValidateKeyDto {
  apiKey: string;
}

interface SetAutoSyncDto {
  enabled: boolean;
}

interface LinkAudiobookDto {
  hardcoverBook: {
    id: string;
    slug: string;
    title: string;
    author_names?: string[];
    content_warnings?: string[];
    featured_series?: {
      name?: string;
      position?: number;
    };
    genres?: string[];
    image?: {
      url?: string;
    };
    isbns?: string[];
    moods?: string[];
    rating?: number;
    ratings_count?: number;
    tags?: string[];
  };
}

@ApiTags('Hardcover')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('hardcover')
@UseGuards(RolesGuard)
@Roles('admin')
export class HardcoverController {
  constructor(private readonly hardcoverService: HardcoverService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get Hardcover integration status',
    description:
      'Returns whether Hardcover API is configured and auto-sync settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Integration status',
    type: HardcoverStatusResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getStatus() {
    const [apiKey, autoSyncOnImport] = await Promise.all([
      this.hardcoverService.getApiKey(),
      this.hardcoverService.getAutoSyncOnImport(),
    ]);
    return {
      configured: !!apiKey,
      autoSyncOnImport,
    };
  }

  @Post('auto-sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set auto-sync setting',
    description:
      'Enable or disable automatic syncing of new imports to Hardcover',
  })
  @ApiResponse({
    status: 200,
    description: 'Setting updated',
    type: HardcoverAutoSyncResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid enabled value' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async setAutoSync(@Body() dto: SetAutoSyncDto) {
    if (typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }

    await this.hardcoverService.setAutoSyncOnImport(dto.enabled);
    return { success: true, autoSyncOnImport: dto.enabled };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate and save API key',
    description: 'Validate a Hardcover API key and save it if valid',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    type: HardcoverValidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'API key is required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async validateKey(@Body() dto: ValidateKeyDto) {
    if (!dto.apiKey || typeof dto.apiKey !== 'string') {
      throw new BadRequestException('API key is required');
    }

    const result = await this.hardcoverService.validateApiKey(dto.apiKey);

    if (result.valid) {
      await this.hardcoverService.setApiKey(dto.apiKey);
    }

    return result;
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disconnect from Hardcover',
    description:
      'Remove the stored API key and disconnect the Hardcover integration',
  })
  @ApiResponse({
    status: 200,
    description: 'Disconnected successfully',
    type: SuccessResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async disconnect() {
    await this.hardcoverService.setApiKey(null);
    return { success: true };
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search Hardcover books',
    description: 'Search for books on Hardcover by title, author, or ISBN',
  })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: HardcoverSearchResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Search query required or API error',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async search(@Query('q') query: string) {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Search query is required');
    }

    const result = await this.hardcoverService.searchBooks(query);

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return result.data;
  }

  @Get('search/audiobook/:id')
  @ApiOperation({
    summary: 'Search Hardcover by audiobook',
    description:
      "Search Hardcover using an audiobook's metadata (title, author)",
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    description: 'Results per page (default: 10)',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Custom search query override',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated search results',
    type: HardcoverSearchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'API error' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async searchByAudiobook(
    @Param('id') audiobookId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('q') customQuery?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const perPageNum = perPage ? parseInt(perPage, 10) : 10;

    const result = await this.hardcoverService.searchByAudiobookIdPaginated(
      audiobookId,
      pageNum,
      perPageNum,
      customQuery,
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      query: result.query,
      ...result.data,
    };
  }

  @Get('link/:audiobookId')
  @ApiOperation({
    summary: 'Get audiobook Hardcover link',
    description: 'Get the Hardcover book linked to an audiobook',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({
    status: 200,
    description: 'Hardcover link data',
    type: HardcoverLinkResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getLink(@Param('audiobookId') audiobookId: string) {
    const link = await this.hardcoverService.getHardcoverLink(
      'audiobook',
      audiobookId,
    );
    return { link };
  }

  @Post('link/:audiobookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link audiobook to Hardcover',
    description: 'Link an audiobook to a Hardcover book for metadata sync',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
    type: HardcoverLinkCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Hardcover book data required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async linkAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: LinkAudiobookDto,
  ) {
    if (
      !dto.hardcoverBook ||
      !dto.hardcoverBook.id ||
      !dto.hardcoverBook.slug
    ) {
      throw new BadRequestException(
        'Hardcover book data with id and slug is required',
      );
    }

    // Cast to HardcoverBookDocument compatible shape
    const hardcoverBook = {
      // Provide default values for required fields not in DTO
      activities_count: 0,
      alternative_titles: [],
      compilation: false,
      contribution_types: [],
      contributions: [],
      description: '',
      has_audiobook: false,
      has_ebook: false,
      lists_count: 0,
      prompts_count: 0,
      reviews_count: 0,
      series_names: [],
      users_count: 0,
      users_read_count: 0,
      // Spread DTO last to ensure its values take precedence
      ...dto.hardcoverBook,
    };

    const link = await this.hardcoverService.linkAudiobookToHardcover(
      audiobookId,
      hardcoverBook as Parameters<
        typeof this.hardcoverService.linkAudiobookToHardcover
      >[1],
    );

    return { success: true, link };
  }

  @Delete('link/:audiobookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink audiobook from Hardcover',
    description: 'Remove the Hardcover link from an audiobook',
  })
  @ApiParam({ name: 'audiobookId', description: 'Audiobook UUID' })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkAudiobook(@Param('audiobookId') audiobookId: string) {
    await this.hardcoverService.unlinkAudiobookFromHardcover(audiobookId);
  }

  // ============ Ebook Endpoints ============

  @Get('search/ebook/:id')
  @ApiOperation({
    summary: 'Search Hardcover by ebook',
    description: "Search Hardcover using an ebook's metadata (title, author)",
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    description: 'Results per page (default: 10)',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Custom search query override',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated search results',
    type: HardcoverSearchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'API error' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async searchByEbook(
    @Param('id') ebookId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('q') customQuery?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const perPageNum = perPage ? parseInt(perPage, 10) : 10;

    const result = await this.hardcoverService.searchByMediaIdPaginated(
      'ebook',
      ebookId,
      pageNum,
      perPageNum,
      customQuery,
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      query: result.query,
      ...result.data,
    };
  }

  @Get('ebook-link/:ebookId')
  @ApiOperation({
    summary: 'Get ebook Hardcover link',
    description: 'Get the Hardcover book linked to an ebook',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID' })
  @ApiResponse({
    status: 200,
    description: 'Hardcover link data',
    type: HardcoverLinkResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getEbookLink(@Param('ebookId') ebookId: string) {
    const link = await this.hardcoverService.getHardcoverLink('ebook', ebookId);
    return { link };
  }

  @Post('ebook-link/:ebookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link ebook to Hardcover',
    description: 'Link an ebook to a Hardcover book for metadata sync',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID' })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
    type: HardcoverLinkCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Hardcover book data required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async linkEbook(
    @Param('ebookId') ebookId: string,
    @Body() dto: LinkAudiobookDto, // Same DTO structure works for ebooks
  ) {
    if (
      !dto.hardcoverBook ||
      !dto.hardcoverBook.id ||
      !dto.hardcoverBook.slug
    ) {
      throw new BadRequestException(
        'Hardcover book data with id and slug is required',
      );
    }

    const hardcoverBook = {
      activities_count: 0,
      alternative_titles: [],
      compilation: false,
      contribution_types: [],
      contributions: [],
      description: '',
      has_audiobook: false,
      has_ebook: false,
      lists_count: 0,
      prompts_count: 0,
      reviews_count: 0,
      series_names: [],
      users_count: 0,
      users_read_count: 0,
      ...dto.hardcoverBook,
    };

    const link = await this.hardcoverService.linkMediaToHardcover(
      'ebook',
      ebookId,
      hardcoverBook as Parameters<
        typeof this.hardcoverService.linkMediaToHardcover
      >[2],
    );

    return { success: true, link };
  }

  @Delete('ebook-link/:ebookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink ebook from Hardcover',
    description: 'Remove the Hardcover link from an ebook',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID' })
  @ApiResponse({ status: 204, description: 'Unlinked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async unlinkEbook(@Param('ebookId') ebookId: string) {
    await this.hardcoverService.unlinkMedia('ebook', ebookId);
  }

  // ============ Sync Queue Endpoints ============

  @Get('queue/status')
  @ApiOperation({
    summary: 'Get sync queue status',
    description:
      'Get the status of the Hardcover sync queue including pending and failed items',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue status',
    type: HardcoverQueueStatusResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getQueueStatus() {
    const [pendingCount, failedItems] = await Promise.all([
      this.hardcoverService.getPendingQueueCount(),
      this.hardcoverService.getFailedQueueItems(),
    ]);

    return {
      pendingCount,
      failedCount: failedItems.length,
      failedItems,
    };
  }

  @Delete('queue/failed/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dismiss failed queue item',
    description: 'Remove a failed item from the sync queue',
  })
  @ApiParam({ name: 'id', description: 'Queue item ID' })
  @ApiResponse({ status: 204, description: 'Item dismissed' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async dismissFailedItem(@Param('id') id: string) {
    await this.hardcoverService.dismissFailedItem(id);
  }

  // ============ Bulk Queue Endpoints ============

  @Post('queue-all-unlinked/audiobooks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue all unlinked audiobooks',
    description: 'Add all audiobooks without Hardcover links to the sync queue',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of items queued',
    type: HardcoverQueueCountResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async queueAllUnlinkedAudiobooks() {
    const queuedCount =
      await this.hardcoverService.queueAllUnlinked('audiobook');
    return { queuedCount };
  }

  @Post('queue-all-unlinked/ebooks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue all unlinked ebooks',
    description: 'Add all ebooks without Hardcover links to the sync queue',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of items queued',
    type: HardcoverQueueCountResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async queueAllUnlinkedEbooks() {
    const queuedCount = await this.hardcoverService.queueAllUnlinked('ebook');
    return { queuedCount };
  }
}
