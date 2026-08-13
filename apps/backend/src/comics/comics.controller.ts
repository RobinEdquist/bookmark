import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  Res,
  NotFoundException,
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
import archiver from 'archiver';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  createContentETag,
  matchesIfNoneMatch,
} from '../common/http-cache.utils';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';
import { ComicsService } from './comics.service';
import { ComicsCollectionsService } from './comics-collections.service';
import {
  ListComicCollectionsQueryDto,
  CreateComicCollectionDto,
  UpdateComicCollectionDto,
  AddCollectionSeriesDto,
  ReorderCollectionSeriesDto,
} from './dto/comic-collection.dto';
import {
  ListComicSeriesQueryDto,
  UpdateComicSeriesDto,
  UpdateComicBookDto,
  UpdateComicCoverDto,
  BatchUpdateComicBooksDto,
  CreateComicSeriesDto,
  MoveComicBooksDto,
  MergeComicSeriesDto,
} from './dto/comics.dto';
import {
  ComicSeriesListResponseDto,
  ComicSeriesDetailDto,
  ComicBookDetailDto,
  ComicNamedRefDto,
  ComicCollectionListResponseDto,
  ComicCollectionDetailDto,
  ComicIdResponseDto,
  ComicSuccessResponseDto,
  ComicMoveResultDto,
  ComicBatchUpdateResultDto,
  ComicCoverUpdateResponseDto,
} from './dto/comics-response.dto';

@ApiTags('Comics')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('comics')
export class ComicsController {
  constructor(
    private readonly comicsService: ComicsService,
    private readonly collectionsService: ComicsCollectionsService,
  ) {}

  // ===== SERIES LIST/FILTER SOURCES =====

  @Get('series')
  @ApiOperation({
    summary: 'List all comic series',
    description:
      'Returns a paginated list of comic series with optional filtering and sorting. Series with tags that the user has blacklisted are automatically excluded.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of comic series',
    type: ComicSeriesListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAllSeries(
    @Query() query: ListComicSeriesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicSeriesListResponseDto> {
    return this.comicsService.findAllSeries(query, user.id);
  }

  @Post('series')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Create an empty comic series',
    description:
      'Creates a virtual (folder-less) comic series to move books into. Requires edit metadata permission.',
  })
  @ApiResponse({
    status: 201,
    description: 'Created series id',
    type: ComicIdResponseDto,
  })
  async createSeries(
    @Body() dto: CreateComicSeriesDto,
  ): Promise<ComicIdResponseDto> {
    return this.comicsService.createSeries(dto);
  }

  @Post('series/merge')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Merge comic series into a target',
    description:
      'Moves all books from the source series into the target, then deletes emptied sources. Requires edit metadata permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Merge result',
    type: ComicMoveResultDto,
  })
  async mergeSeries(
    @Body() dto: MergeComicSeriesDto,
  ): Promise<ComicMoveResultDto> {
    return this.comicsService.mergeSeries(
      dto.sourceSeriesIds,
      dto.targetSeriesId,
    );
  }

  // ===== COLLECTIONS =====

  @Get('collections')
  @ApiOperation({ summary: 'List comic collections' })
  @ApiResponse({ status: 200, type: ComicCollectionListResponseDto })
  async findAllCollections(
    @Query() query: ListComicCollectionsQueryDto,
  ): Promise<ComicCollectionListResponseDto> {
    return this.collectionsService.findAll(query);
  }

  @Post('collections')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Create a comic collection' })
  @ApiResponse({ status: 201, type: ComicIdResponseDto })
  async createCollection(
    @Body() dto: CreateComicCollectionDto,
  ): Promise<ComicIdResponseDto> {
    return this.collectionsService.create(dto);
  }

  @Get('collections/:id')
  @ApiOperation({ summary: 'Get a comic collection with its series' })
  @ApiResponse({ status: 200, type: ComicCollectionDetailDto })
  async getCollection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicCollectionDetailDto> {
    return this.collectionsService.findOne(id, user.id);
  }

  @Patch('collections/:id')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Update a comic collection' })
  @ApiResponse({ status: 200, type: ComicSuccessResponseDto })
  async updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateComicCollectionDto,
  ): Promise<ComicSuccessResponseDto> {
    return this.collectionsService.update(id, dto);
  }

  @Delete('collections/:id')
  @UseGuards(CanDeleteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comic collection' })
  async deleteCollection(@Param('id') id: string) {
    await this.collectionsService.remove(id);
  }

  @Post('collections/:id/series')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Add a series to a collection' })
  @ApiResponse({ status: 200, type: ComicSuccessResponseDto })
  async addCollectionSeries(
    @Param('id') id: string,
    @Body() dto: AddCollectionSeriesDto,
  ): Promise<ComicSuccessResponseDto> {
    return this.collectionsService.addSeries(id, dto.seriesId);
  }

  @Delete('collections/:id/series/:seriesId')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Remove a series from a collection' })
  @ApiResponse({ status: 200, type: ComicSuccessResponseDto })
  async removeCollectionSeries(
    @Param('id') id: string,
    @Param('seriesId') seriesId: string,
  ): Promise<ComicSuccessResponseDto> {
    return this.collectionsService.removeSeries(id, seriesId);
  }

  @Patch('collections/:id/order')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Reorder series within a collection' })
  @ApiResponse({ status: 200, type: ComicSuccessResponseDto })
  async reorderCollectionSeries(
    @Param('id') id: string,
    @Body() dto: ReorderCollectionSeriesDto,
  ): Promise<ComicSuccessResponseDto> {
    return this.collectionsService.reorder(id, dto.seriesIds);
  }

  @Get('publishers')
  @ApiOperation({
    summary: 'List all comic publishers',
    description: 'Returns a list of all publishers with comics in the library',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter publishers by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of publisher names',
    schema: { type: 'array', items: { type: 'string' } },
  })
  async getPublishers(@Query('search') search?: string): Promise<string[]> {
    return this.comicsService.listPublishers(search);
  }

  @Get('genres')
  @ApiOperation({
    summary: 'List all comic genres',
    description: 'Returns a list of all genres used by comic series',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter genres by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of genres',
    type: [ComicNamedRefDto],
  })
  async getGenres(
    @Query('search') search?: string,
  ): Promise<ComicNamedRefDto[]> {
    return this.comicsService.listGenres(search);
  }

  // ===== SERIES DETAIL / MUTATE =====

  @Get('series/:id')
  @ApiOperation({
    summary: 'Get comic series details',
    description:
      'Returns complete details of a comic series including its books. Access denied if series has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Comic series details',
    type: ComicSeriesDetailDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Comic series not found' })
  async getSeriesById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicSeriesDetailDto> {
    return this.comicsService.getSeriesById(id, user.id);
  }

  @Patch('series/:id')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Update comic series metadata',
    description:
      'Update comic series metadata. Requires edit metadata permission.',
  })
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Update result',
    type: ComicSuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires edit metadata permission',
  })
  @ApiResponse({ status: 404, description: 'Comic series not found' })
  async updateSeries(
    @Param('id') id: string,
    @Body() dto: UpdateComicSeriesDto,
  ): Promise<ComicSuccessResponseDto> {
    return this.comicsService.updateSeries(id, dto);
  }

  @Delete('series/:id')
  @UseGuards(CanDeleteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete comic series',
    description:
      'Delete a comic series and all its books from the library. Optionally delete the source files from disk.',
  })
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
  @ApiQuery({
    name: 'deleteFiles',
    required: false,
    description: 'Set to "true" to also delete files from disk',
  })
  @ApiResponse({
    status: 204,
    description: 'Comic series deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Comic series not found' })
  async deleteSeries(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.comicsService.deleteSeries(id, deleteFiles === 'true');
  }

  // ===== SERIES COVER =====

  @Post('series/:id/cover')
  @UseGuards(CanEditMetadataGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Update comic series cover',
    description:
      'Upload a new cover image via file upload or URL. Supports JPG, PNG, and WebP formats. Max file size: 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
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
    type: ComicCoverUpdateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid file type, file too large, or neither file nor URL provided',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Comic series not found' })
  async updateSeriesCover(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: UpdateComicCoverDto,
  ): Promise<ComicCoverUpdateResponseDto> {
    this.validateCoverInput(file, body);

    if (file) {
      return this.comicsService.updateSeriesCoverFromFile(id, file.buffer);
    } else {
      return this.comicsService.updateSeriesCoverFromUrl(id, body!.url!);
    }
  }

  private validateCoverInput(
    file: Express.Multer.File | undefined,
    body: UpdateComicCoverDto | undefined,
  ): void {
    if (!file && !body?.url) {
      throw new BadRequestException('Either file or url must be provided');
    }
    if (file && body?.url) {
      throw new BadRequestException('Provide either file or url, not both');
    }
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        throw new BadRequestException('File size must be less than 2 MB');
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Allowed: JPG, PNG, WebP',
        );
      }
    }
  }

  @Get('series/:id/cover')
  @ApiOperation({
    summary: 'Get comic series cover image',
    description:
      'Returns the cover image for a comic series. The response is authorized per user, so it is only privately cacheable and clients must revalidate before reuse.',
  })
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cover image binary data' })
  @ApiResponse({ status: 304, description: 'Cover image not modified' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Cover not found' })
  async getSeriesCover(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.comicsService.verifySeriesNotBlacklisted(id, user.id);

    // Any missing-cover response from this endpoint must not be cached.
    res.setHeader('Cache-Control', 'no-store');

    const coverPath = await this.comicsService.getSeriesCoverFilePath(id);

    if (!coverPath) {
      throw new NotFoundException('Cover not found');
    }

    let data: Buffer;
    try {
      data = await fs.promises.readFile(coverPath);
    } catch {
      throw new NotFoundException('Cover not found');
    }

    this.sendPrivateCover(res, data, ifNoneMatch);
  }

  /**
   * Send a cover image with per-user cache semantics. Cover responses are
   * authorized per user (tag blacklists), so shared caches must never reuse
   * them for another client; the ETag keeps client-side revalidation cheap.
   */
  private sendPrivateCover(
    res: express.Response,
    data: Buffer,
    ifNoneMatch: string | undefined,
  ): void {
    const etag = createContentETag(data);

    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);

    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', data.length.toString());
    res.end(data);
  }

  @Get('series/:id/download')
  @ApiOperation({
    summary: 'Download all books in a comic series as ZIP',
    description:
      'Download all books in a comic series as a ZIP archive. Access denied if series has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Comic series UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'ZIP archive of all books' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Comic series not found' })
  async downloadSeries(
    @Param('id') id: string,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.comicsService.verifySeriesNotBlacklisted(id, user.id);
    const downloadInfo = await this.comicsService.getSeriesDownloadInfo(id);

    const zipName = `${downloadInfo.seriesTitle}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(zipName)}"`,
    );

    const archive = archiver('zip', { zlib: { level: 0 } });

    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    for (const file of downloadInfo.files) {
      archive.file(file.absolutePath, { name: file.fileName });
    }

    await archive.finalize();
  }

  // ===== BOOKS =====

  @Get('books/:id')
  @ApiOperation({
    summary: 'Get comic book details',
    description:
      'Returns details for a single comic book. Access denied if the parent series has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Comic book details',
    type: ComicBookDetailDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async getBookById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComicBookDetailDto> {
    return this.comicsService.getBookById(id, user.id);
  }

  @Patch('books/batch')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Batch update comic book metadata',
    description:
      'Update format and/or ageRating for multiple comic books at once. Requires edit metadata permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch update result',
    type: ComicBatchUpdateResultDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires edit metadata permission',
  })
  async updateBooksBatch(
    @Body() dto: BatchUpdateComicBooksDto,
  ): Promise<ComicBatchUpdateResultDto> {
    return this.comicsService.updateBooksBatch(dto.ids, dto.data);
  }

  @Post('books/move')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Move comic books to another series',
    description:
      'Reassigns the given books to the target series and pins the placement so re-scans do not undo it. Requires edit metadata permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Move result',
    type: ComicMoveResultDto,
  })
  async moveBooks(@Body() dto: MoveComicBooksDto): Promise<ComicMoveResultDto> {
    return this.comicsService.moveBooksToSeries(
      dto.bookIds,
      dto.targetSeriesId,
    );
  }

  @Patch('books/:id')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Update comic book metadata',
    description:
      'Update comic book metadata. Requires edit metadata permission.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Update result',
    type: ComicSuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires edit metadata permission',
  })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async updateBook(
    @Param('id') id: string,
    @Body() dto: UpdateComicBookDto,
  ): Promise<ComicSuccessResponseDto> {
    return this.comicsService.updateBook(id, dto);
  }

  @Delete('books/:id')
  @UseGuards(CanDeleteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete comic book',
    description:
      'Delete a comic book from the library. Optionally delete the source file from disk.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiQuery({
    name: 'deleteFiles',
    required: false,
    description: 'Set to "true" to also delete the file from disk',
  })
  @ApiResponse({ status: 204, description: 'Comic book deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async deleteBook(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.comicsService.deleteBook(id, deleteFiles === 'true');
  }

  // ===== BOOK COVER =====

  @Post('books/:id/cover')
  @UseGuards(CanEditMetadataGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Update comic book cover',
    description:
      'Upload a new cover image via file upload or URL. Supports JPG, PNG, and WebP formats. Max file size: 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
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
    type: ComicCoverUpdateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid file type, file too large, or neither file nor URL provided',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async updateBookCover(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: UpdateComicCoverDto,
  ): Promise<ComicCoverUpdateResponseDto> {
    this.validateCoverInput(file, body);

    if (file) {
      return this.comicsService.updateBookCoverFromFile(id, file.buffer);
    } else {
      return this.comicsService.updateBookCoverFromUrl(id, body!.url!);
    }
  }

  @Get('books/:id/cover')
  @ApiOperation({
    summary: 'Get comic book cover image',
    description:
      'Returns the cover image for a comic book. Lazily extracts from the comic file if not cached. The response is authorized per user, so it is only privately cacheable and clients must revalidate before reuse.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cover image binary data' })
  @ApiResponse({ status: 304, description: 'Cover image not modified' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Cover not found' })
  async getBookCover(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.comicsService.verifyBookNotBlacklisted(id, user.id);

    // Any missing-cover response from this endpoint must not be cached.
    res.setHeader('Cache-Control', 'no-store');

    const coverPath = await this.comicsService.getBookCoverFilePath(id);

    if (!coverPath) {
      throw new NotFoundException('Cover not found');
    }

    let data: Buffer;
    try {
      data = await fs.promises.readFile(coverPath);
    } catch {
      throw new NotFoundException('Cover not found');
    }

    this.sendPrivateCover(res, data, ifNoneMatch);
  }

  // ===== BOOK DOWNLOAD =====

  @Get('books/:id/download')
  @ApiOperation({
    summary: 'Download a comic book file',
    description:
      'Download the comic book file directly. Access denied if the parent series has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Comic book file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - series has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Comic book not found' })
  async downloadBook(
    @Param('id') id: string,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.comicsService.verifyBookNotBlacklisted(id, user.id);
    const downloadInfo = await this.comicsService.getBookDownloadInfo(id);

    res.setHeader('Content-Type', downloadInfo.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadInfo.fileName)}"`,
    );
    res.setHeader('Content-Length', downloadInfo.fileSize.toString());

    const stream = fs.createReadStream(downloadInfo.filePath);
    stream.pipe(res);
  }
}
