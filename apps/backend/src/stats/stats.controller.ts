import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { StatsService } from './stats.service';
import { StatsResponseDto } from './dto/stats-response.dto';

@ApiTags('Stats')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('stats')
@UseGuards(AdminGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get server statistics',
    description:
      'Returns aggregate, server-wide library and request statistics for ' +
      'dashboards (e.g. Glance). Requires an admin session cookie or an API ' +
      'key belonging to an admin user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Server statistics',
    type: StatsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getStats(): Promise<StatsResponseDto> {
    return this.statsService.getStats();
  }
}
