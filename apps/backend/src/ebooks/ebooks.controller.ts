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
import * as express from 'express';
import * as fs from 'fs';
import { EbooksService, EbookFilters } from './ebooks.service';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('ebooks')
export class EbooksController {
  constructor(private readonly ebooksService: EbooksService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('genreId') genreId?: string,
    @Query('seriesId') seriesId?: string,
    @Query('authorId') authorId?: string,
    @Query('language') language?: string,
    @Query('sortBy') sortBy?: 'title' | 'createdAt' | 'author' | 'rating' | 'series',
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
    return this.ebooksService.findAll(filters);
  }

  @Get('authors')
  async getAuthors(@Query('search') search?: string) {
    return this.ebooksService.getAuthors(search);
  }

  @Get('publishers')
  async getPublishers(@Query('search') search?: string) {
    return this.ebooksService.getPublishers(search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ebooksService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateEbookDto) {
    return this.ebooksService.update(id, dto);
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

      return this.ebooksService.updateCoverFromFile(id, file.buffer);
    } else {
      return this.ebooksService.updateCoverFromUrl(id, body!.url!);
    }
  }

  @Get(':id/cover')
  @Header('Cache-Control', 'public, max-age=86400')
  async getCover(@Param('id') id: string) {
    const cover = await this.ebooksService.getCover(id);

    if (!cover) {
      throw new NotFoundException('Cover not found');
    }

    return new StreamableFile(cover.data, {
      type: cover.mimeType,
    });
  }

  /**
   * Download the ebook file.
   */
  @Get(':id/download')
  @UseGuards(AuthGuard)
  async download(@Param('id') id: string, @Res() res: express.Response) {
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
  async delete(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.ebooksService.delete(id, deleteFiles === 'true');
  }
}
