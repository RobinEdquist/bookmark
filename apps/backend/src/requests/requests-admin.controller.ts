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
import { RejectRequestDto } from './dto';
import {
  RequestListResponseDto,
  ContentRequestDto,
} from './dto/request-response.dto';
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
    enum: ['pending', 'approved', 'downloading', 'complete', 'rejected'],
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
    type: RequestListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getAllRequests(
    @Query('status') status?: RequestStatus,
    @Query('missing', new ParseBoolPipe({ optional: true }))
    missing?: boolean,
  ) {
    return this.requestsService.getAllRequests(status, missing ?? false);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve request (Admin)',
    description: 'Approve a pending request. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Request approved successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async approveRequest(@Param('id') id: string) {
    return this.requestsService.approveRequest(id);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject request (Admin)',
    description:
      'Reject a pending request with an optional reason. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Request rejected successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async rejectRequest(@Param('id') id: string, @Body() dto: RejectRequestDto) {
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
