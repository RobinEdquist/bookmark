import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Header,
  Req,
  Res,
  NotFoundException,
  StreamableFile,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiSecurity,
} from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { EbooksService, EbookFilters } from './ebooks.service';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';
import {
  EbookListResponseDto,
  EbookDetailDto,
  UpdateEbookCoverResponseDto,
  EbookPersonDto,
  EbookSeriesDto,
} from './dto/ebook-response.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { parseRangeHeader } from './http-range';

/** Formats the in-browser reader can open (foliate-js: epub/mobi/azw3, react-pdf: pdf). */
const STREAMABLE_MIME_TYPES = new Set([
  'application/epub+zip',
  'application/pdf',
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.mobi8-ebook',
]);

@ApiTags('Ebooks')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('ebooks')
export class EbooksController {
  constructor(private readonly ebooksService: EbooksService) {}

  @Get()
  @ApiOperation({
    summary: 'List all ebooks',
    description:
      'Returns a paginated list of ebooks with optional filtering and sorting. Ebooks with tags that the user has blacklisted are automatically excluded.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by title or author',
  })
  @ApiQuery({
    name: 'genreId',
    required: false,
    description: 'Filter by genre ID',
  })
  @ApiQuery({
    name: 'seriesId',
    required: false,
    description: 'Filter by series ID',
  })
  @ApiQuery({
    name: 'authorId',
    required: false,
    description: 'Filter by author ID',
  })
  @ApiQuery({
    name: 'language',
    required: false,
    description: 'Filter by language code (e.g., "en", "sv")',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['title', 'createdAt', 'author', 'rating', 'series'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of items to skip for pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'List of ebooks',
    type: EbookListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('genreId') genreId?: string,
    @Query('seriesId') seriesId?: string,
    @Query('authorId') authorId?: string,
    @Query('language') language?: string,
    @Query('sortBy')
    sortBy?: 'title' | 'createdAt' | 'author' | 'rating' | 'series',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters: EbookFilters = {
      search,
      genreId,
      seriesId,
      authorId,
      language,
      sortBy,
      sortOrder,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.ebooksService.findAll(filters, user.id);
  }

  @Get('authors')
  @ApiOperation({
    summary: 'List all ebook authors',
    description: 'Returns a list of all authors with ebooks in the library',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter authors by name',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiResponse({
    status: 200,
    description: 'List of authors with IDs and names',
    type: [EbookPersonDto],
  })
  async getAuthors(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ebooksService.getAuthors(
      search,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('publishers')
  @ApiOperation({
    summary: 'List all ebook publishers',
    description: 'Returns a list of all publishers in the ebook library',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter publishers by name',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiResponse({
    status: 200,
    description: 'List of publishers',
    type: [String],
  })
  async getPublishers(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ebooksService.getPublishers(
      search,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('series')
  @ApiOperation({
    summary: 'List all ebook series',
    description: 'Returns a list of all series with ebooks',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter series by name',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiResponse({
    status: 200,
    description: 'List of series with IDs and names',
    type: [EbookSeriesDto],
  })
  async getSeries(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ebooksService.getSeries(
      search,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('genres')
  @ApiOperation({
    summary: 'List all ebook genres',
    description: 'Returns a list of all genres with ebooks, including count',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter genres by name',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return',
  })
  @ApiResponse({
    status: 200,
    description: 'List of genres with IDs, names, and counts',
  })
  async getGenres(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ebooksService.getGenres(
      search,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ebook details',
    description:
      'Returns complete details of an ebook including metadata. Access denied if ebook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Ebook details',
    type: EbookDetailDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ebooksService.verifyNotBlacklisted(id, user.id);
    return this.ebooksService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update ebook metadata',
    description:
      'Update ebook metadata including title, authors, genres, and series',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Updated ebook',
    type: EbookDetailDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateEbookDto) {
    return this.ebooksService.update(id, dto);
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Update ebook cover',
    description:
      'Upload a new cover image via file upload or URL. Supports JPG, PNG, and WebP formats. Max file size: 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file (JPG, PNG, or WebP)',
        },
        url: {
          type: 'string',
          description:
            'URL to download cover from (alternative to file upload)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Cover updated successfully',
    type: UpdateEbookCoverResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid file type, file too large, or neither file nor URL provided',
  })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async updateCover(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: UpdateCoverDto,
  ) {
    // Either file or URL must be provided
    if (!file && !body?.url) {
      throw new BadRequestException('Either file or url must be provided');
    }

    if (file && body?.url) {
      throw new BadRequestException('Provide either file or url, not both');
    }

    if (file) {
      // Validate file size (2 MB)
      if (file.size > 2 * 1024 * 1024) {
        throw new BadRequestException('File size must be less than 2 MB');
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Allowed: JPG, PNG, WebP',
        );
      }

      return this.ebooksService.updateCoverFromFile(id, file.buffer);
    } else {
      return this.ebooksService.updateCoverFromUrl(id, body!.url!);
    }
  }

  @Get(':id/cover')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({
    summary: 'Get ebook cover image',
    description:
      'Returns the cover image for an ebook. Cached for 24 hours. Access denied if ebook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cover image binary data' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Cover not found' })
  async getCover(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ebooksService.verifyNotBlacklisted(id, user.id);
    const cover = await this.ebooksService.getCover(id);

    if (!cover) {
      throw new NotFoundException('Cover not found');
    }

    return new StreamableFile(cover.data, {
      type: cover.mimeType,
    });
  }

  @Get(':id/download')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Download ebook file',
    description:
      'Download the ebook file (EPUB, PDF, etc.). Access denied if ebook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ebook file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async download(
    @Param('id') id: string,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Check if user has blacklisted any tags on this ebook
    await this.ebooksService.verifyNotBlacklisted(id, user.id);
    const downloadInfo = await this.ebooksService.getDownloadInfo(id);

    res.setHeader('Content-Type', downloadInfo.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadInfo.fileName)}"`,
    );
    res.setHeader('Content-Length', downloadInfo.fileSize.toString());

    const stream = fs.createReadStream(downloadInfo.filePath);
    stream.pipe(res);
  }

  @Get(':id/stream')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Stream ebook file for in-browser reading',
    description:
      'Streams the ebook file for the in-browser reader. Supports EPUB, PDF, MOBI and AZW3 formats, with HTTP range requests for partial content. Access denied if ebook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ebook file stream' })
  @ApiResponse({ status: 206, description: 'Partial ebook file stream' })
  @ApiResponse({
    status: 400,
    description: 'Format does not support in-browser reading',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  async stream(
    @Param('id') id: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ebooksService.verifyNotBlacklisted(id, user.id);
    const downloadInfo = await this.ebooksService.getDownloadInfo(id);

    if (!STREAMABLE_MIME_TYPES.has(downloadInfo.mimeType)) {
      throw new BadRequestException(
        'Format does not support in-browser reading',
      );
    }

    res.setHeader('Content-Type', downloadInfo.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const fileSize = downloadInfo.fileSize;
      const parsed = parseRangeHeader(range, fileSize);

      if (!parsed) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
        return;
      }

      const { start, end } = parsed;
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', (end - start + 1).toString());

      fs.createReadStream(downloadInfo.filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', downloadInfo.fileSize.toString());

    const stream = fs.createReadStream(downloadInfo.filePath);
    stream.pipe(res);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete ebook',
    description:
      'Delete an ebook from the library. Optionally delete the source file from disk.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID', format: 'uuid' })
  @ApiQuery({
    name: 'deleteFiles',
    required: false,
    description: 'Set to "true" to also delete files from disk',
  })
  @ApiResponse({ status: 204, description: 'Ebook deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async delete(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.ebooksService.delete(id, deleteFiles === 'true');
  }
}
