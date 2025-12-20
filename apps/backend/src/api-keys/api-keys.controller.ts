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
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  Session,
  AuthService,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyPermissionGuard } from '../common/guards/api-key-permission.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { IncomingHttpHeaders } from 'http';

@ApiTags('API Keys')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly authService: AuthService,
  ) {}

  // ===== User Endpoints =====

  @Get('me')
  @UseGuards(ApiKeyPermissionGuard)
  @ApiOperation({
    summary: 'Get my API key',
    description: "Returns the current user's API key if one exists",
  })
  @ApiResponse({
    status: 200,
    description: 'API key details or null if none exists',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user does not have API key permission',
  })
  async getMyApiKey(@Session() session: UserSession) {
    return this.apiKeysService.getUserApiKey(session.user.id);
  }

  @Post()
  @UseGuards(ApiKeyPermissionGuard)
  @ApiOperation({
    summary: 'Create API key',
    description:
      'Generate a new API key for the current user. Only one key per user is allowed - creating a new key revokes any existing key.',
  })
  @ApiResponse({
    status: 201,
    description:
      'API key created successfully. The full key is only shown once.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user does not have API key permission',
  })
  async createApiKey(@Session() session: UserSession) {
    return this.apiKeysService.createApiKey(
      session.user.id,
      this.authService.instance,
    );
  }

  @Delete(':id')
  @UseGuards(ApiKeyPermissionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke API key',
    description: 'Revoke an API key. Users can only revoke their own keys.',
  })
  @ApiParam({ name: 'id', description: 'API key ID to revoke' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - cannot revoke another user's key",
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
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
  @ApiOperation({
    summary: 'Get user API key (Admin)',
    description:
      'Get API key details for a specific user. Requires admin role.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'API key details or null if none exists',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getUserApiKey(@Param('userId') userId: string) {
    return this.apiKeysService.getUserApiKey(userId);
  }

  @Delete('user/:userId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke user API key (Admin)',
    description: 'Revoke the API key for a specific user. Requires admin role.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'User has no API key' })
  async revokeUserApiKey(@Param('userId') userId: string) {
    return this.apiKeysService.revokeUserApiKeyByUserId(userId);
  }
}
