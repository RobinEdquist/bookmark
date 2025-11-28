import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Header,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AudiobooksService, AudiobookFilters } from './audiobooks.service';
import { UpdateAudiobookDto } from './dto/update-audiobook.dto';

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
}
