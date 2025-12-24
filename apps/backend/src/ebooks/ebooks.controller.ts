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
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { EbooksService, EbookFilters } from './ebooks.service';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';
import { AuthGuard } from '../common/guards/auth.guard';

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
    description: 'Number of items to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of items to skip for pagination',
  })
  @ApiResponse({ status: 200, description: 'List of ebooks' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Session() session: UserSession,
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
    return this.ebooksService.findAll(filters, session.user.id);
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
  @ApiResponse({
    status: 200,
    description: 'List of authors with IDs and names',
  })
  async getAuthors(@Query('search') search?: string) {
    return this.ebooksService.getAuthors(search);
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
  @ApiResponse({ status: 200, description: 'List of publishers' })
  async getPublishers(@Query('search') search?: string) {
    return this.ebooksService.getPublishers(search);
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
  @ApiResponse({
    status: 200,
    description: 'List of series with IDs and names',
  })
  async getSeries(@Query('search') search?: string) {
    return this.ebooksService.getSeries(search);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ebook details',
    description:
      'Returns complete details of an ebook including metadata. Access denied if ebook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
  @ApiResponse({ status: 200, description: 'Ebook details' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Ebook not found' })
  async findOne(@Param('id') id: string, @Session() session: UserSession) {
    await this.ebooksService.verifyNotBlacklisted(id, session.user.id);
    return this.ebooksService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update ebook metadata',
    description:
      'Update ebook metadata including title, authors, genres, and series',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
  @ApiResponse({ status: 200, description: 'Updated ebook' })
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
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
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
  @ApiResponse({ status: 200, description: 'Cover updated successfully' })
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
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
  @ApiResponse({ status: 200, description: 'Cover image binary data' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - ebook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Cover not found' })
  async getCover(@Param('id') id: string, @Session() session: UserSession) {
    await this.ebooksService.verifyNotBlacklisted(id, session.user.id);
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
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
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
    @Session() session: UserSession,
  ) {
    // Check if user has blacklisted any tags on this ebook
    await this.ebooksService.verifyNotBlacklisted(id, session.user.id);
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete ebook',
    description:
      'Delete an ebook from the library. Optionally delete the source file from disk.',
  })
  @ApiParam({ name: 'id', description: 'Ebook UUID' })
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
