import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { RequestsService } from './requests.service';
import { RejectRequestDto } from './dto';
import { RequestStatus } from './schema';

@Controller('admin/requests')
@UseGuards(AdminGuard)
export class RequestsAdminController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  async getAllRequests(@Query('status') status?: RequestStatus) {
    return this.requestsService.getAllRequests(status);
  }

  @Post(':id/approve')
  async approveRequest(@Param('id') id: string) {
    return this.requestsService.approveRequest(id);
  }

  @Post(':id/reject')
  async rejectRequest(@Param('id') id: string, @Body() dto: RejectRequestDto) {
    return this.requestsService.rejectRequest(id, dto);
  }
}
