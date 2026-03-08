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
import { GrFinderService } from './gr-finder.service';
import {
  GrFinderSearchResponseDto,
  GrFinderStatusResponseDto,
  GrFinderLinkResponseDto,
  GrFinderLinkCreatedResponseDto,
} from './dto/gr-finder-response.dto';

interface LinkGoodreadsDto {
  goodreadsId: string;
}

@ApiTags('Goodreads Finder')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('gr-finder')
@UseGuards(RolesGuard)
@Roles('admin')
export class GrFinderController {
  constructor(private readonly grFinderService: GrFinderService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get Goodreads Finder integration status',
    description:
      'Returns whether Goodreads Finder is configured via GR_FINDER_URL',
  })
  @ApiResponse({
    status: 200,
    description: 'Integration status',
    type: GrFinderStatusResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getStatus() {
    return {
      configured: this.grFinderService.isConfigured(),
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
    description: 'Search query required or service not configured',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async search(@Query('q') query: string) {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Search query is required');
    }

    if (!this.grFinderService.isConfigured()) {
      throw new BadRequestException('Goodreads Finder is not configured');
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
  })
  @ApiResponse({ status: 400, description: 'Service not configured' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async searchByAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Query('q') customQuery?: string,
  ) {
    if (!this.grFinderService.isConfigured()) {
      throw new BadRequestException('Goodreads Finder is not configured');
    }

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
  })
  @ApiResponse({ status: 400, description: 'Service not configured' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async searchByEbook(
    @Param('ebookId') ebookId: string,
    @Query('q') customQuery?: string,
  ) {
    if (!this.grFinderService.isConfigured()) {
      throw new BadRequestException('Goodreads Finder is not configured');
    }

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
  })
  @ApiResponse({
    status: 400,
    description: 'Service not configured',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getBookDetails(@Param('goodreadsId') goodreadsId: string) {
    if (!this.grFinderService.isConfigured()) {
      throw new BadRequestException('Goodreads Finder is not configured');
    }

    try {
      return await this.grFinderService.getBookDetails(goodreadsId);
    } catch (error) {
      if (error instanceof BadRequestException) {
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
  async getAudiobookLink(@Param('audiobookId') audiobookId: string) {
    const link = await this.grFinderService.getGoodreadsLink(
      'audiobook',
      audiobookId,
    );
    return { link };
  }

  @Post('link/:audiobookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link audiobook to Goodreads',
    description: 'Link an audiobook to a Goodreads book for metadata reference',
  })
  @ApiParam({
    name: 'audiobookId',
    description: 'Audiobook UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
    type: GrFinderLinkCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Goodreads ID required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async linkAudiobook(
    @Param('audiobookId') audiobookId: string,
    @Body() dto: LinkGoodreadsDto,
  ) {
    if (!dto.goodreadsId) {
      throw new BadRequestException('Goodreads ID is required');
    }

    const link = await this.grFinderService.linkMediaToGoodreads(
      'audiobook',
      audiobookId,
      dto.goodreadsId,
    );

    return { success: true, link };
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
  async unlinkAudiobook(@Param('audiobookId') audiobookId: string) {
    await this.grFinderService.unlinkMedia('audiobook', audiobookId);
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
  async getEbookLink(@Param('ebookId') ebookId: string) {
    const link = await this.grFinderService.getGoodreadsLink('ebook', ebookId);
    return { link };
  }

  @Post('ebook-link/:ebookId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link ebook to Goodreads',
    description: 'Link an ebook to a Goodreads book for metadata reference',
  })
  @ApiParam({ name: 'ebookId', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Link created successfully',
    type: GrFinderLinkCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Goodreads ID required' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async linkEbook(
    @Param('ebookId') ebookId: string,
    @Body() dto: LinkGoodreadsDto,
  ) {
    if (!dto.goodreadsId) {
      throw new BadRequestException('Goodreads ID is required');
    }

    const link = await this.grFinderService.linkMediaToGoodreads(
      'ebook',
      ebookId,
      dto.goodreadsId,
    );

    return { success: true, link };
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
  async unlinkEbook(@Param('ebookId') ebookId: string) {
    await this.grFinderService.unlinkMedia('ebook', ebookId);
  }
}
