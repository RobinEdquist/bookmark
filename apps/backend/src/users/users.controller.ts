import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../auth/schema';
import { UsersService } from './users.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, BanUserDto } from './dto/update-user.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import {
  UserResponseDto,
  UserListResponseDto,
  UserPermissionsResponseDto,
  LanguageResponseDto,
  ThemeResponseDto,
} from './dto/user-response.dto';
import type { UserResponse, UserListResponse } from './dto/user-response.dto';

@ApiTags('Users')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: NodePgDatabase<typeof schema>,
    private readonly usersService: UsersService,
  ) {}

  // ===== Public/Self Endpoints =====
  // IMPORTANT: These must be declared BEFORE :id routes to prevent route conflicts

  @Get('me')
  @ApiOperation({
    summary: 'Get current user',
    description:
      'Returns the current authenticated user information. Works with both session cookies and API tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user data',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.usersService.findById(user.id);
  }

  @Get('session')
  @ApiOperation({
    summary: 'Get current session',
    description:
      'Returns the current authenticated user information. Supports both session cookies and API tokens.',
  })
  @ApiResponse({ status: 200, description: 'Current user session data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSession(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('me/language')
  @ApiOperation({
    summary: 'Get my language preference',
    description: 'Get the UI language preference for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Language preference',
    type: LanguageResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLanguage(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ language: string }> {
    const language = await this.usersService.getLanguage(user.id);
    return { language };
  }

  @Patch('me/language')
  @ApiOperation({
    summary: 'Update my language preference',
    description: 'Update the UI language preference for the current user',
  })
  @ApiResponse({ status: 200, description: 'Language updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid language code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateLanguage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLanguageDto,
  ): Promise<{ success: boolean }> {
    await this.usersService.updateLanguage(user.id, dto.language);
    return { success: true };
  }

  @Get('me/permissions')
  @ApiOperation({
    summary: 'Get my permissions',
    description: 'Get the permissions for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'User permissions',
    type: UserPermissionsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPermissions(user.id);
  }

  @Get('me/theme')
  @ApiOperation({
    summary: 'Get my theme preferences',
    description: 'Get the theme color preferences for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Theme preferences',
    type: ThemeResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTheme(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ primaryColor: string; surfaceColor: string }> {
    return this.usersService.getTheme(user.id);
  }

  @Patch('me/theme')
  @ApiOperation({
    summary: 'Update my theme preferences',
    description: 'Update primary and surface color theme preferences',
  })
  @ApiResponse({ status: 200, description: 'Theme updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid color format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateTheme(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateThemeDto,
  ): Promise<{ success: boolean }> {
    await this.usersService.updateTheme(
      user.id,
      dto.primaryColor,
      dto.surfaceColor,
    );
    return { success: true };
  }

  // ===== Admin Endpoints =====
  // Note: Parameterized routes (:id) must come AFTER specific routes (me, session)

  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'List all users (Admin)',
    description: 'Returns a list of all users. Requires admin role.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or email',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: UserListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async findAll(@Query('search') search?: string): Promise<UserListResponse> {
    return this.usersService.findAll(search);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Create user (Admin)',
    description: 'Create a new user account. Requires admin role.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or email already exists',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return this.usersService.create(dto);
  }

  // ===== Parameterized Routes (must be LAST) =====

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get user by ID (Admin)',
    description: 'Returns user details. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User details',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserResponse> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update user (Admin)',
    description: 'Update user details and permissions. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - requires admin role or cannot modify own admin status',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.update(id, dto, currentUser.id);
  }

  @Post(':id/ban')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Ban user (Admin)',
    description:
      'Ban a user from the system with an optional reason. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User banned successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires admin role or cannot ban self',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async ban(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.ban(id, dto, currentUser.id);
  }

  @Post(':id/unban')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Unban user (Admin)',
    description: 'Remove ban from a user. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User unbanned successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unban(@Param('id') id: string): Promise<UserResponse> {
    return this.usersService.unban(id);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete user (Admin)',
    description: 'Delete a user account. Requires admin role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires admin role or cannot delete self',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    return this.usersService.delete(id, currentUser.id);
  }
}
