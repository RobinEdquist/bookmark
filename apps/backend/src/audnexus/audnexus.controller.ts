import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AudnexusService } from './audnexus.service';
import { SearchAudibleDto, GetChaptersDto } from './dto/search-audible.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { AudibleSearchResult } from './types/audible-search.types';
import { ChaptersResponse } from './types/audnexus-chapters.types';

@Controller('audnexus')
@UseGuards(AuthGuard)
export class AudnexusController {
  constructor(private readonly audnexusService: AudnexusService) {}

  /**
   * Search Audible catalog by title and optionally author
   */
  @Get('search')
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

  /**
   * Fetch chapters from Audnexus by ASIN
   */
  @Get('chapters/:asin')
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
