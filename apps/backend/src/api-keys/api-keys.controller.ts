import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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
import { AuthService } from '@thallesp/nestjs-better-auth';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { ApiKeysService } from './api-keys.service';
import {
  ApiKeyResponseDto,
  ApiKeyCreateResponseDto,
  RevokeApiKeyResponseDto,
} from './dto/api-key-response.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyPermissionGuard } from '../common/guards/api-key-permission.guard';
import { AdminGuard } from '../common/guards/admin.guard';

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
    summary: 'List my API keys',
    description: "Returns all of the current user's active API keys",
  })
  @ApiResponse({
    status: 200,
    description: 'List of API keys (empty array if none exist)',
    type: ApiKeyResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user does not have API key permission',
  })
  async getMyApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeysService.getUserApiKeys(user.id);
  }

  @Post()
  @UseGuards(ApiKeyPermissionGuard)
  @ApiOperation({
    summary: 'Create API key',
    description:
      'Generate a new API key for the current user. Users can hold up to 10 active keys.',
  })
  @ApiResponse({
    status: 201,
    description:
      'API key created successfully. The full key is only shown once.',
    type: ApiKeyCreateResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user does not have API key permission',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - maximum number of API keys reached',
  })
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeysService.createApiKey(
      user.id,
      this.authService.instance,
      dto.name,
    );
  }

  @Delete(':id')
  @UseGuards(ApiKeyPermissionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke API key',
    description: 'Revoke an API key. Users can only revoke their own keys.',
  })
  @ApiParam({ name: 'id', description: 'API key ID to revoke', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'API key revoked successfully',
    type: RevokeApiKeyResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: "Forbidden - cannot revoke another user's key",
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeApiKey(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apiKeysService.revokeApiKey(id, user.id);
  }

  // ===== Admin Endpoints =====

  @Get('user/:userId')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'List user API keys (Admin)',
    description:
      'List all active API keys for a specific user. Requires admin role.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'List of API keys (empty array if none exist)',
    type: ApiKeyResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async getUserApiKeys(@Param('userId') userId: string) {
    return this.apiKeysService.getUserApiKeys(userId);
  }

  @Delete('user/:userId/:keyId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke one user API key (Admin)',
    description:
      'Revoke a single API key for a specific user. Requires admin role.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID', format: 'uuid' })
  @ApiParam({ name: 'keyId', description: 'API key ID to revoke' })
  @ApiResponse({
    status: 200,
    description: 'API key revoked successfully',
    type: RevokeApiKeyResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeUserApiKeyById(
    @Param('userId') userId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.apiKeysService.revokeApiKey(keyId, userId);
  }

  @Delete('user/:userId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all user API keys (Admin)',
    description:
      'Revoke all API keys for a specific user. Requires admin role.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'All API keys revoked',
    type: RevokeApiKeyResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async revokeUserApiKey(@Param('userId') userId: string) {
    return this.apiKeysService.revokeUserApiKeyByUserId(userId);
  }
}
