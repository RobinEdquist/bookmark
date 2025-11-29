import { Controller, Get, Query } from '@nestjs/common';
import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  async getAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.seriesService.getAll(
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get('recently-updated')
  async getRecentlyUpdated(@Query('limit') limit?: string) {
    return this.seriesService.getRecentlyUpdated(
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
