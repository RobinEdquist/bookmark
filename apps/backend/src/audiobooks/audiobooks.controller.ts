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
  Headers,
  Req,
  Res,
  NotFoundException,
  InternalServerErrorException,
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
import * as path from 'path';
import archiver from 'archiver';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AudiobooksService, AudiobookFilters } from './audiobooks.service';
import { UpdateAudiobookDto } from './dto/update-audiobook.dto';
import { ImportChaptersDto } from '../audnexus/dto/import-chapters.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';

@ApiTags('Audiobooks')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('audiobooks')
export class AudiobooksController {
  constructor(private readonly audiobooksService: AudiobooksService) {}

  @Get()
  @ApiOperation({
    summary: 'List all audiobooks',
    description:
      'Returns a paginated list of audiobooks with optional filtering and sorting. Audiobooks with tags that the user has blacklisted are automatically excluded.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by title, author, or narrator',
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
  @ApiResponse({ status: 200, description: 'List of audiobooks' })
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
    const filters: AudiobookFilters = {
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
    return this.audiobooksService.findAll(filters, session.user.id);
  }

  @Get('authors')
  @ApiOperation({
    summary: 'List all authors',
    description: 'Returns a list of all authors with audiobooks in the library',
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
    return this.audiobooksService.getAuthors(search);
  }

  @Get('narrators')
  @ApiOperation({
    summary: 'List all narrators',
    description:
      'Returns a list of all narrators with audiobooks in the library',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter narrators by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of narrators with IDs and names',
  })
  async getNarrators(@Query('search') search?: string) {
    return this.audiobooksService.getNarrators(search);
  }

  @Get('publishers')
  @ApiOperation({
    summary: 'List all publishers',
    description: 'Returns a list of all publishers in the library',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter publishers by name',
  })
  @ApiResponse({ status: 200, description: 'List of publishers' })
  async getPublishers(@Query('search') search?: string) {
    return this.audiobooksService.getPublishers(search);
  }

  @Get('genres')
  @ApiOperation({
    summary: 'List all genres',
    description: 'Returns a list of all genres assigned to audiobooks',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter genres by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of genres with IDs and names',
  })
  async getGenres(@Query('search') search?: string) {
    return this.audiobooksService.getGenres(search);
  }

  @Get('tags')
  @ApiOperation({
    summary: 'List all tags',
    description: 'Returns a list of all tags assigned to audiobooks',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter tags by name',
  })
  @ApiResponse({ status: 200, description: 'List of tags with IDs and names' })
  async getTags(@Query('search') search?: string) {
    return this.audiobooksService.getTags(search);
  }

  @Get('series')
  @ApiOperation({
    summary: 'List all series',
    description: 'Returns a list of all series with audiobooks',
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
    return this.audiobooksService.getSeries(search);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get audiobook details',
    description:
      'Returns complete details of an audiobook including metadata, chapters, and files. Access denied if audiobook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Audiobook details' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - audiobook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async findOne(@Param('id') id: string, @Session() session: UserSession) {
    await this.audiobooksService.verifyNotBlacklisted(id, session.user.id);
    return this.audiobooksService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update audiobook metadata',
    description:
      'Update audiobook metadata including title, authors, narrators, genres, tags, and series',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Updated audiobook' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateAudiobookDto) {
    return this.audiobooksService.update(id, dto);
  }

  @Post(':id/refresh-chapters')
  @ApiOperation({
    summary: 'Refresh chapters from audio files',
    description:
      'Re-extract chapter information from the embedded metadata in audio files',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Chapters refreshed successfully' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async refreshChapters(@Param('id') id: string) {
    return this.audiobooksService.refreshChapters(id);
  }

  @Post(':id/chapters/import')
  @UseGuards(AuthGuard, CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Import chapters from Audible',
    description:
      'Import chapter data from Audible via Audnexus API. Requires edit metadata permission.',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Chapters imported successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error (invalid ASIN format)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires edit metadata permission',
  })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async importChapters(
    @Param('id') id: string,
    @Body() dto: ImportChaptersDto,
  ) {
    return this.audiobooksService.importExternalChapters(
      id,
      dto.asin,
      dto.chapters,
    );
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Update audiobook cover',
    description:
      'Upload a new cover image via file upload or URL. Supports JPG, PNG, and WebP formats. Max file size: 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
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
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
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

      return this.audiobooksService.updateCoverFromFile(id, file.buffer);
    } else {
      return this.audiobooksService.updateCoverFromUrl(id, body!.url!);
    }
  }

  @Get(':id/cover')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({
    summary: 'Get audiobook cover image',
    description:
      'Returns the cover image for an audiobook. Cached for 24 hours. Access denied if audiobook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Cover image binary data' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - audiobook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Cover not found' })
  async getCover(@Param('id') id: string, @Session() session: UserSession) {
    await this.audiobooksService.verifyNotBlacklisted(id, session.user.id);
    const cover = await this.audiobooksService.getCover(id);

    if (!cover) {
      throw new NotFoundException('Cover not found');
    }

    return new StreamableFile(cover.data, {
      type: cover.mimeType,
    });
  }

  /**
   * Stream audio for an audiobook with seek support.
   * Supports HTTP Range requests for efficient seeking.
   * Also handles HEAD requests for fetching stream metadata.
   *
   * Query params:
   * - position: Start position in seconds (for seek-by-time)
   */
  @Get(':id/stream')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Stream audiobook audio',
    description: `Stream audio with seek support. Supports HTTP Range requests for efficient seeking. Access denied if audiobook has tags blacklisted by the user.

**Custom Response Headers:**
- \`X-Audiobook-Total-Duration\`: Total duration of the audiobook in seconds
- \`X-File-Duration\`: Duration of the current file in seconds
- \`X-File-Index\`: Index of the current file (for multi-file audiobooks)
- \`X-File-Start-Position\`: Position in audiobook where this file starts`,
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiQuery({
    name: 'position',
    required: false,
    description: 'Start position in seconds for seek-by-time',
  })
  @ApiResponse({ status: 200, description: 'Full audio stream' })
  @ApiResponse({ status: 206, description: 'Partial content (range request)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - audiobook has blacklisted tags',
  })
  @ApiResponse({
    status: 404,
    description: 'Audiobook or audio file not found',
  })
  async stream(
    @Param('id') id: string,
    @Query('position') positionParam: string | undefined,
    @Headers('range') rangeHeader: string | undefined,
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Session() session: UserSession,
  ) {
    // Check if user has blacklisted any tags on this audiobook
    await this.audiobooksService.verifyNotBlacklisted(id, session.user.id);
    const position = positionParam ? parseInt(positionParam, 10) : 0;

    // Get stream info (finds correct file and offset for position)
    const streamInfo = await this.audiobooksService.getStreamInfo(id, position);

    // Get file stats with error handling
    let fileSize: number;
    try {
      const stat = fs.statSync(streamInfo.filePath);
      fileSize = stat.size;
    } catch (error: unknown) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        throw new NotFoundException('Audio file not found on disk');
      }
      throw new InternalServerErrorException('Failed to access audio file');
    }

    // Calculate byte offset from time offset
    // Approximate: (offsetInFile / fileDuration) * fileSize
    // This is an approximation since audio files aren't perfectly linear
    const estimatedByteOffset =
      streamInfo.offsetInFile > 0
        ? Math.floor(
            (streamInfo.offsetInFile / streamInfo.fileDuration) * fileSize,
          )
        : 0;

    // Custom headers for frontend to track position
    res.setHeader(
      'X-Audiobook-Total-Duration',
      streamInfo.totalDuration.toString(),
    );
    res.setHeader('X-File-Duration', streamInfo.fileDuration.toString());
    res.setHeader('X-File-Index', streamInfo.fileIndex.toString());
    res.setHeader(
      'X-File-Start-Position',
      streamInfo.fileStartPosition.toString(),
    );
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', streamInfo.mimeType);
    res.setHeader('Content-Length', fileSize.toString());

    // HEAD requests: return headers only, no body
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    // Handle HTTP Range requests (for seeking within buffered content)
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize.toString());

      const stream = fs.createReadStream(streamInfo.filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream audio file' });
        }
      });
      stream.pipe(res);
    } else if (estimatedByteOffset > 0) {
      // Seek by time: start from estimated byte position
      const end = fileSize - 1;
      const chunkSize = end - estimatedByteOffset + 1;

      res.status(206);
      res.setHeader(
        'Content-Range',
        `bytes ${estimatedByteOffset}-${end}/${fileSize}`,
      );
      res.setHeader('Content-Length', chunkSize.toString());

      const stream = fs.createReadStream(streamInfo.filePath, {
        start: estimatedByteOffset,
        end,
      });
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream audio file' });
        }
      });
      stream.pipe(res);
    } else {
      // Stream from beginning
      const stream = fs.createReadStream(streamInfo.filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to stream audio file' });
        }
      });
      stream.pipe(res);
    }
  }

  /**
   * Download audiobook files.
   * Single file with embedded cover: returns the audio file directly.
   * Multiple files or separate cover: returns a ZIP archive.
   */
  @Get(':id/download')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Download audiobook files',
    description:
      'Download the audiobook files. Single file audiobooks with embedded covers return the audio file directly. Multi-file audiobooks or those with separate covers return a ZIP archive. Access denied if audiobook has tags blacklisted by the user.',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiResponse({ status: 200, description: 'Audio file or ZIP archive' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Access denied - audiobook has blacklisted tags',
  })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async download(
    @Param('id') id: string,
    @Res() res: express.Response,
    @Session() session: UserSession,
  ) {
    // Check if user has blacklisted any tags on this audiobook
    await this.audiobooksService.verifyNotBlacklisted(id, session.user.id);
    const downloadInfo = await this.audiobooksService.getDownloadInfo(id);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadInfo.fileName)}"`,
    );
    res.setHeader('Content-Type', downloadInfo.mimeType);

    if (!downloadInfo.isZip) {
      // Single file with embedded cover - stream directly
      res.setHeader('Content-Length', downloadInfo.fileSize!.toString());
      const stream = fs.createReadStream(downloadInfo.filePath!);
      stream.pipe(res);
    } else {
      // Multiple files or separate cover - create ZIP on-the-fly
      const archive = archiver('zip', { zlib: { level: 0 } }); // No compression for audio

      archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
      });

      archive.pipe(res);

      // Add audio files
      for (const file of downloadInfo.files!) {
        archive.file(file.filePath, { name: file.fileName });
      }

      // Add cover image if separate
      if (downloadInfo.coverPath) {
        const coverExt = path.extname(downloadInfo.coverPath);
        archive.file(downloadInfo.coverPath, { name: `cover${coverExt}` });
      }

      await archive.finalize();
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete audiobook',
    description:
      'Delete an audiobook from the library. Optionally delete the source files from disk.',
  })
  @ApiParam({ name: 'id', description: 'Audiobook UUID' })
  @ApiQuery({
    name: 'deleteFiles',
    required: false,
    description: 'Set to "true" to also delete files from disk',
  })
  @ApiResponse({ status: 204, description: 'Audiobook deleted successfully' })
  @ApiResponse({ status: 404, description: 'Audiobook not found' })
  async delete(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.audiobooksService.delete(id, deleteFiles === 'true');
  }
}
