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

@Controller('audiobooks')
export class AudiobooksController {
  constructor(private readonly audiobooksService: AudiobooksService) {}

  @Get()
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
  async getAuthors(@Query('search') search?: string) {
    return this.audiobooksService.getAuthors(search);
  }

  @Get('narrators')
  async getNarrators(@Query('search') search?: string) {
    return this.audiobooksService.getNarrators(search);
  }

  @Get('publishers')
  async getPublishers(@Query('search') search?: string) {
    return this.audiobooksService.getPublishers(search);
  }

  @Get('genres')
  async getGenres(@Query('search') search?: string) {
    return this.audiobooksService.getGenres(search);
  }

  @Get('tags')
  async getTags(@Query('search') search?: string) {
    return this.audiobooksService.getTags(search);
  }

  @Get('series')
  async getSeries(@Query('search') search?: string) {
    return this.audiobooksService.getSeries(search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.audiobooksService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAudiobookDto) {
    return this.audiobooksService.update(id, dto);
  }

  @Post(':id/refresh-chapters')
  async refreshChapters(@Param('id') id: string) {
    return this.audiobooksService.refreshChapters(id);
  }

  @Post(':id/chapters/import')
  @UseGuards(AuthGuard, CanEditMetadataGuard)
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
  async getCover(@Param('id') id: string) {
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
  async stream(
    @Param('id') id: string,
    @Query('position') positionParam: string | undefined,
    @Headers('range') rangeHeader: string | undefined,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
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
  async download(@Param('id') id: string, @Res() res: express.Response) {
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
  async delete(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.audiobooksService.delete(id, deleteFiles === 'true');
  }
}
