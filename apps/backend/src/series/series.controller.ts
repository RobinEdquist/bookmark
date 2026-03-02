import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { SeriesService } from './series.service';
import { SeriesListResponseDto } from './dto/series-response.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';

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
    description: 'Number of items to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of items to skip for pagination',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search series by name',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'lastUpdated', 'bookCount'],
    description: 'Field to sort by',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
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
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'name' | 'lastUpdated' | 'bookCount',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.seriesService.getAll(
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
      search,
      sortBy,
      sortOrder,
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
    description: 'Number of items to return',
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get series by ID',
    description:
      'Returns detailed series information including all audiobooks and ebooks',
  })
  @ApiParam({
    name: 'id',
    description: 'Series ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Series detail with audiobooks and ebooks',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Series not found' })
  async getById(@Param('id') id: string) {
    return this.seriesService.getById(id);
  }

  @Patch(':id')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({
    summary: 'Update series metadata',
    description: 'Updates editable series metadata fields',
  })
  @ApiParam({
    name: 'id',
    description: 'Series ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Series metadata updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Series not found' })
  async update(@Param('id') id: string, @Body() body: UpdateSeriesDto) {
    return this.seriesService.update(id, body);
  }
}
