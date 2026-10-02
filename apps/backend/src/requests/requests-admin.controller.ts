import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseBoolPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { RequestsService } from './requests.service';
import { RequestAttemptDto } from './dto/request-attempt.dto';
import { RejectRequestDto } from './dto';
import { ContentRequestDto } from './dto/request-response.dto';
import type { RequestStatus } from './schema';

@ApiTags('Requests Admin')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('admin/requests')
@UseGuards(AdminGuard)
export class RequestsAdminController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all requests (Admin)',
    description:
      'Returns all user requests with optional status filter. Requires admin role.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'pending',
      'approved',
      'waiting',
      'downloading',
      'complete',
      'rejected',
    ],
    description: 'Filter by request status',
  })
  @ApiQuery({
    name: 'missing',
    required: false,
    type: Boolean,
    description:
      'Only return requests whose torrent is no longer in the download client',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all requests',
    type: [ContentRequestDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getAllRequests(
    @Query('status') status?: RequestStatus,
    @Query('missing', new ParseBoolPipe({ optional: true }))
    missing?: boolean,
  ): Promise<ContentRequestDto[]> {
    return this.requestsService.getAllRequests(status, missing ?? false);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve request (Admin)',
    description:
      'Approve a pending request once. Without a selected release it becomes waiting and is searched on the shared schedule. With a release, a durable attempt is recorded before submission. An uncertain submission is retained for reconciliation and is not automatically retried. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Request approved successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({
    status: 400,
    description:
      'Request is no longer pending or the selected source changed; recheck availability first',
  })
  @ApiResponse({
    status: 500,
    description:
      'Submission failed or returned an invalid identity; an uncertain attempt may have been persisted',
  })
  @ApiResponse({
    status: 503,
    description:
      'Module unavailable; an uncertain submission attempt may have been persisted',
  })
  @ApiResponse({
    status: 'default',
    description:
      'Upstream module HTTP errors are propagated. Inspect attempt history before reconciling a failed submission; approval may already be recorded.',
  })
  async approveRequest(@Param('id') id: string): Promise<ContentRequestDto> {
    return this.requestsService.approveRequest(id);
  }

  @Get(':id/attempts')
  @ApiOperation({
    summary: 'Inspect request download history (Admin)',
    description:
      'Returns all durable attempts in creation order, oldest first. An empty array means no attempt has been submitted. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({ status: 200, type: [RequestAttemptDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async getAttempts(@Param('id') id: string): Promise<RequestAttemptDto[]> {
    return this.requestsService.getAttempts(id);
  }

  @Post(':id/recheck')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Queue an eligible availability check (Admin)',
    description:
      'Queues a pending or waiting request without a selected release, or a pending request whose selected source changed. A stale selection is cleared. Returns immediately; the worker keeps shared rate limits and approval gates. Future publication dates, active downloads, and live search leases cannot be bypassed. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description:
      'Availability check queued; nextSearchAt is due now, searchError is cleared',
    type: ContentRequestDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Request does not exist or is not eligible for a check',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async recheckRequest(@Param('id') id: string): Promise<ContentRequestDto> {
    return this.requestsService.recheckRequest(id);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject request (Admin)',
    description:
      'Reject a pending request with an optional reason. Cancels its scheduled availability check, clears search errors, and revokes live search claims. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Request rejected successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({
    status: 400,
    description: 'Only pending requests can be rejected',
  })
  async rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
  ): Promise<ContentRequestDto> {
    return this.requestsService.rejectRequest(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete request (Admin)',
    description:
      'Permanently removes a request and its supporters. Intended for requests whose torrent is gone from the download client and can no longer complete. The download client itself is not touched. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Request deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async deleteRequest(@Param('id') id: string): Promise<void> {
    await this.requestsService.deleteRequest(id);
  }
}
