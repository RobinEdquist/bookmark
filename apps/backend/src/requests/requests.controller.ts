import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
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

@Controller('requests')
@UseGuards(CanRequestGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post('search')
  async search(@Body() dto: SearchMamDto, @Req() req: AuthenticatedRequest) {
    return this.requestsService.search(
      dto.query,
      dto.limit ?? 25,
      dto.offset ?? 0,
      req.session.user.id,
    );
  }

  @Get()
  async getMyRequests(@Req() req: AuthenticatedRequest) {
    return this.requestsService.getUserRequests(req.session.user.id);
  }

  @Post()
  async createRequest(
    @Body() dto: CreateRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.requestsService.createRequest(dto, req.session.user.id);
  }

  @Post(':id/support')
  async supportRequest(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requestsService.addSupporter(id, req.session.user.id);
    return this.requestsService.getRequestById(id, req.session.user.id);
  }
}
