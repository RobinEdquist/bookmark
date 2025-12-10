import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  Session,
  AuthService,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyPermissionGuard } from '../common/guards/api-key-permission.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { IncomingHttpHeaders } from 'http';

@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly authService: AuthService,
  ) {}

  // ===== User Endpoints =====

  @Get('me')
  @UseGuards(ApiKeyPermissionGuard)
  async getMyApiKey(@Session() session: UserSession) {
    return this.apiKeysService.getUserApiKey(session.user.id);
  }

  @Post()
  @UseGuards(ApiKeyPermissionGuard)
  async createApiKey(@Session() session: UserSession) {
    return this.apiKeysService.createApiKey(
      session.user.id,
      this.authService.instance,
    );
  }

  @Delete(':id')
  @UseGuards(ApiKeyPermissionGuard)
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Headers() headers: IncomingHttpHeaders,
  ) {
    return this.apiKeysService.revokeApiKey(
      id,
      session.user.id,
      this.authService.instance,
      headers,
    );
  }

  // ===== Admin Endpoints =====

  @Get('user/:userId')
  @UseGuards(AdminGuard)
  async getUserApiKey(@Param('userId') userId: string) {
    return this.apiKeysService.getUserApiKey(userId);
  }

  @Delete('user/:userId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async revokeUserApiKey(@Param('userId') userId: string) {
    return this.apiKeysService.revokeUserApiKeyByUserId(userId);
  }
}
