import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CanRequestGuard } from '../common/guards/can-request.guard';
import { RequestsService } from './requests.service';
import { SearchMamDto, CreateRequestDto } from './dto';

interface AuthenticatedRequest extends Request {
  session: {
    user: {
      id: string;
      email: string;
      role: string;
    };
  };
}

@ApiTags('Requests')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('requests')
@UseGuards(CanRequestGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post('search')
  @ApiOperation({
    summary: 'Search for content to request',
    description:
      'Search the MAM catalog for audiobooks, ebooks, or all content types',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results with request status',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async search(@Body() dto: SearchMamDto, @Req() req: AuthenticatedRequest) {
    return this.requestsService.search(
      dto.query,
      dto.perPage ?? 25,
      dto.offset ?? 0,
      req.session.user.id,
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
  @ApiResponse({ status: 200, description: 'List of user requests' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getMyRequests(@Req() req: AuthenticatedRequest) {
    return this.requestsService.getUserRequests(req.session.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new request',
    description: 'Submit a request for content to be added to the library',
  })
  @ApiResponse({ status: 201, description: 'Request created successfully' })
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
    @Req() req: AuthenticatedRequest,
  ) {
    return this.requestsService.createRequest(dto, req.session.user.id);
  }

  @Post(':id/support')
  @ApiOperation({
    summary: 'Support a request',
    description:
      'Add your support to an existing request to help prioritize it',
  })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Support added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async supportRequest(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requestsService.addSupporter(id, req.session.user.id);
    return this.requestsService.getRequestById(id, req.session.user.id);
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
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getAutoApproveBudget(@Req() req: AuthenticatedRequest) {
    const { used, limit } = await this.requestsService.getUserAutoApproveUsage(
      req.session.user.id,
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
