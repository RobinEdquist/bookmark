import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { SeriesService } from './series.service';
import { SeriesListResponseDto } from './dto/series-response.dto';

@ApiTags('Series')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all series',
    description: 'Returns a paginated list of all book series in the library',
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
  @ApiResponse({
    status: 200,
    description: 'List of series with metadata',
    type: SeriesListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({
    summary: 'Get recently updated series',
    description: 'Returns series that have had books added or updated recently',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of recently updated series',
    type: SeriesListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRecentlyUpdated(@Query('limit') limit?: string) {
    return this.seriesService.getRecentlyUpdated(
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
