import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { CanRequestGuard } from '../common/guards/can-request.guard';
import { TrackerService } from '../tracker';
import { RequestsService } from './requests.service';
import { TrackerSearchDto, CreateRequestDto } from './dto';
import {
  TrackerSearchResponseDto,
  RequestListResponseDto,
  ContentRequestDto,
  AutoApproveBudgetDto,
} from './dto/request-response.dto';

@ApiTags('Requests')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('requests')
@UseGuards(CanRequestGuard)
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly tracker: TrackerService,
  ) {}

  @Get('cover/:id')
  @ApiOperation({
    summary: 'Proxy torrent cover image',
    description: 'Proxies a torrent cover/thumbnail image from the tracker',
  })
  @ApiParam({ name: 'id', description: 'Torrent ID' })
  @ApiResponse({ status: 200, description: 'Image data' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async proxyImage(@Param('id') id: string, @Res() res: Response) {
    await this.tracker.proxyImage(id, res);
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search for content to request',
    description:
      'Search the tracker catalog for audiobooks, ebooks, or all content types',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results with request status',
    type: TrackerSearchResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async search(
    @Body() dto: TrackerSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.search(
      dto.query,
      dto.perPage ?? 25,
      dto.offset ?? 0,
      user.id,
      dto.contentType ?? 'all',
      dto.searchIn,
      dto.languages,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get my requests',
    description: 'Returns all requests made by the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user requests',
    type: RequestListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getMyRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.requestsService.getUserRequests(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new request',
    description: 'Submit a request for content to be added to the library',
  })
  @ApiResponse({
    status: 201,
    description: 'Request created successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate request',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async createRequest(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.createRequest(dto, user.id);
  }

  @Post(':id/support')
  @ApiOperation({
    summary: 'Support a request',
    description:
      'Add your support to an existing request to help prioritize it',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Support added successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async supportRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requestsService.addSupporter(id, user.id);
    return this.requestsService.getRequestById(id, user.id);
  }

  @Get('auto-approve-budget')
  @ApiOperation({
    summary: 'Get auto-approve budget',
    description:
      'Returns how many auto-approved requests the user can make this week',
  })
  @ApiResponse({
    status: 200,
    description:
      'Auto-approve budget with used, limit, remaining, and reset time',
    type: AutoApproveBudgetDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getAutoApproveBudget(@CurrentUser() user: AuthenticatedUser) {
    const { used, limit } = await this.requestsService.getUserAutoApproveUsage(
      user.id,
    );

    // Calculate next Monday 00:00 UTC
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: nextMonday.toISOString(),
    };
  }
}
