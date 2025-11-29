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
  NotFoundException,
  StreamableFile,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudiobooksService, AudiobookFilters } from './audiobooks.service';
import { UpdateAudiobookDto } from './dto/update-audiobook.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';

@Controller('audiobooks')
export class AudiobooksController {
  constructor(private readonly audiobooksService: AudiobooksService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('genreId') genreId?: string,
    @Query('seriesId') seriesId?: string,
    @Query('authorId') authorId?: string,
    @Query('language') language?: string,
    @Query('sortBy') sortBy?: 'title' | 'createdAt' | 'author',
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
    return this.audiobooksService.findAll(filters);
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @Query('deleteFiles') deleteFiles?: string,
  ) {
    await this.audiobooksService.delete(id, deleteFiles === 'true');
  }
}
