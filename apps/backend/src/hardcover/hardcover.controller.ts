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
import { HardcoverService } from './hardcover.service';
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

@Controller('hardcover')
@UseGuards(RolesGuard)
@Roles('admin')
export class HardcoverController {
  constructor(private readonly hardcoverService: HardcoverService) {}

  @Get('status')
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
  async setAutoSync(@Body() dto: SetAutoSyncDto) {
    if (typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }

    await this.hardcoverService.setAutoSyncOnImport(dto.enabled);
    return { success: true, autoSyncOnImport: dto.enabled };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
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
  async disconnect() {
    await this.hardcoverService.setApiKey(null);
    return { success: true };
  }

  @Get('search')
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
  async searchByAudiobook(
    @Param('id') audiobookId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const perPageNum = perPage ? parseInt(perPage, 10) : 10;

    const result = await this.hardcoverService.searchByAudiobookIdPaginated(
      audiobookId,
      pageNum,
      perPageNum,
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
  async getLink(@Param('audiobookId') audiobookId: string) {
    const link = await this.hardcoverService.getHardcoverLink('audiobook', audiobookId);
    return { link };
  }

  @Post('link/:audiobookId')
  @HttpCode(HttpStatus.OK)
  async linkAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: LinkAudiobookDto,
  ) {
    if (!dto.hardcoverBook || !dto.hardcoverBook.id || !dto.hardcoverBook.slug) {
      throw new BadRequestException('Hardcover book data with id and slug is required');
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
  async unlinkAudiobook(@Param('audiobookId') audiobookId: string) {
    await this.hardcoverService.unlinkAudiobookFromHardcover(audiobookId);
  }

  // ============ Ebook Endpoints ============

  @Get('search/ebook/:id')
  async searchByEbook(
    @Param('id') ebookId: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const perPageNum = perPage ? parseInt(perPage, 10) : 10;

    const result = await this.hardcoverService.searchByMediaIdPaginated(
      'ebook',
      ebookId,
      pageNum,
      perPageNum,
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
  async getEbookLink(@Param('ebookId') ebookId: string) {
    const link = await this.hardcoverService.getHardcoverLink('ebook', ebookId);
    return { link };
  }

  @Post('ebook-link/:ebookId')
  @HttpCode(HttpStatus.OK)
  async linkEbook(
    @Param('ebookId') ebookId: string,
    @Body() dto: LinkAudiobookDto, // Same DTO structure works for ebooks
  ) {
    if (!dto.hardcoverBook || !dto.hardcoverBook.id || !dto.hardcoverBook.slug) {
      throw new BadRequestException('Hardcover book data with id and slug is required');
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
  async unlinkEbook(@Param('ebookId') ebookId: string) {
    await this.hardcoverService.unlinkMedia('ebook', ebookId);
  }

  // ============ Sync Queue Endpoints ============

  @Get('queue/status')
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
  async dismissFailedItem(@Param('id') id: string) {
    await this.hardcoverService.dismissFailedItem(id);
  }
}
