import { Controller, Get, Param, Query } from '@nestjs/common';
import { AudiobooksService, AudiobookFilters } from './audiobooks.service';

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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.audiobooksService.findById(id);
  }
}
