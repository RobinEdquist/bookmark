import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { MetadataGapsService } from './metadata-gaps.service';
import {
  ListMetadataGapsQueryDto,
  MetadataGapListDto,
  MetadataGapsSummaryDto,
  MetadataGapsSummaryQueryDto,
} from './dto/metadata-gaps.dto';

@ApiTags('Metadata gaps')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard, CanEditMetadataGuard)
@Controller('metadata-gaps')
export class MetadataGapsController {
  constructor(private readonly metadataGapsService: MetadataGapsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Count items missing each metadata field',
    description:
      'One count per gap for the chosen library, plus how many items have ' +
      'at least one gap. Each count carries how that gap can be closed, so ' +
      'work that one link would fix can be told apart from work that has to ' +
      'be typed in. A field counts as present when any configured metadata ' +
      'source supplies it, not just the local column.',
  })
  @ApiResponse({
    status: 200,
    description: 'One count per gap, plus the totals',
    type: MetadataGapsSummaryDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Requires metadata edit rights' })
  async getSummary(
    @Query() query: MetadataGapsSummaryQueryDto,
  ): Promise<MetadataGapsSummaryDto> {
    return this.metadataGapsService.getSummary(query.type);
  }

  @Get()
  @ApiOperation({
    summary: 'List items with missing metadata',
    description:
      'Paginated worklist of items that still need metadata. Without a ' +
      '`missing` filter it returns everything with at least one gap. Hidden ' +
      'items are always excluded.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated items with the gaps each one has',
    type: MetadataGapListDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Requires metadata edit rights' })
  async list(
    @Query() query: ListMetadataGapsQueryDto,
  ): Promise<MetadataGapListDto> {
    return this.metadataGapsService.list(query);
  }
}
