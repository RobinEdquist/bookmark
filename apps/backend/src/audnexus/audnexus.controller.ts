import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AudnexusService } from './audnexus.service';
import { SearchAudibleDto, GetChaptersDto } from './dto/search-audible.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { AudibleSearchResult } from './types/audible-search.types';
import { ChaptersResponse } from './types/audnexus-chapters.types';

@ApiTags('Audnexus')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('audnexus')
@UseGuards(AuthGuard)
export class AudnexusController {
  constructor(private readonly audnexusService: AudnexusService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search Audible catalog',
    description:
      'Search the Audible catalog by title and optionally author using the Audnexus API',
  })
  @ApiQuery({
    name: 'title',
    required: true,
    description: 'Book title to search for',
  })
  @ApiQuery({
    name: 'author',
    required: false,
    description: 'Optional author name to narrow results',
  })
  @ApiQuery({
    name: 'region',
    required: false,
    description: 'Audible region (e.g., us, uk, de)',
  })
  @ApiResponse({ status: 200, description: 'Search results from Audible' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async searchAudible(
    @Query() dto: SearchAudibleDto,
  ): Promise<{ results: AudibleSearchResult[]; total: number }> {
    const results = await this.audnexusService.searchAudible(
      dto.title,
      dto.author,
      dto.region,
    );

    return {
      results,
      total: results.length,
    };
  }

  @Get('chapters/:asin')
  @ApiOperation({
    summary: 'Get chapters by ASIN',
    description:
      'Fetch chapter information for an audiobook by its Audible ASIN from Audnexus',
  })
  @ApiParam({
    name: 'asin',
    description:
      'Audible Standard Identification Number (10 alphanumeric characters)',
  })
  @ApiQuery({
    name: 'region',
    required: false,
    description: 'Audible region (e.g., us, uk, de)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chapter information including timestamps',
  })
  @ApiResponse({ status: 400, description: 'Invalid ASIN format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Chapters not found for ASIN' })
  async getChaptersByAsin(
    @Param('asin') asin: string,
    @Query() dto: GetChaptersDto,
  ): Promise<ChaptersResponse> {
    // Validate ASIN format (10 alphanumeric characters)
    if (!/^[A-Za-z0-9]{10}$/.test(asin)) {
      throw new BadRequestException(
        'ASIN must be exactly 10 alphanumeric characters',
      );
    }

    return this.audnexusService.fetchChaptersByAsin(
      asin.toUpperCase(),
      dto.region,
    );
  }
}
