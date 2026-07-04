import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ItunesService } from './itunes.service';
import { SearchItunesDto } from './dto/search-itunes.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { ItunesSearchResponseDto } from './dto/itunes-response.dto';

@ApiTags('iTunes')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('itunes')
@UseGuards(AuthGuard)
export class ItunesController {
  constructor(private readonly itunesService: ItunesService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search the iTunes Store catalog',
    description:
      'Search the iTunes Store for audiobooks or ebooks using the public iTunes Search API',
  })
  @ApiQuery({
    name: 'term',
    required: true,
    description: 'Search term (title and/or author)',
  })
  @ApiQuery({
    name: 'media',
    required: false,
    description: 'Media type to search for (audiobook or ebook)',
  })
  @ApiQuery({
    name: 'country',
    required: false,
    description:
      'Two-letter ISO country code for the store front (e.g., US, SE)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results from iTunes',
    type: ItunesSearchResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(
    @Query() dto: SearchItunesDto,
  ): Promise<ItunesSearchResponseDto> {
    const results = await this.itunesService.search(
      dto.term,
      dto.media,
      dto.country,
    );

    return {
      results,
      total: results.length,
    };
  }
}
