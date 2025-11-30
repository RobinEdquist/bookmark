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
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../auth/schema';
import { UsersService } from './users.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, BanUserDto } from './dto/update-user.dto';
import type { UpdateLanguageDto } from './dto/update-language.dto';
import type { UpdateThemeDto } from './dto/update-theme.dto';
import type { UserResponse, UserListResponse } from './dto/user-response.dto';

@Controller('users')
export class UsersController {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: NodePgDatabase<typeof schema>,
    private readonly usersService: UsersService,
  ) {}

  // ===== Admin Endpoints =====

  @Get()
  @UseGuards(AdminGuard)
  async findAll(@Query('search') search?: string): Promise<UserListResponse> {
    return this.usersService.findAll(search);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  async findOne(@Param('id') id: string): Promise<UserResponse> {
    return this.usersService.findById(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Session() session: UserSession,
  ): Promise<UserResponse> {
    return this.usersService.update(id, dto, session.user.id);
  }

  @Post(':id/ban')
  @UseGuards(AdminGuard)
  async ban(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @Session() session: UserSession,
  ): Promise<UserResponse> {
    return this.usersService.ban(id, dto, session.user.id);
  }

  @Post(':id/unban')
  @UseGuards(AdminGuard)
  async unban(@Param('id') id: string): Promise<UserResponse> {
    return this.usersService.unban(id);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @Session() session: UserSession,
  ): Promise<void> {
    return this.usersService.delete(id, session.user.id);
  }

  // ===== Public/Self Endpoints =====

  @Get('session')
  getSession(@Session() session: UserSession) {
    return session.user;
  }

  @Get('setup-admin-completed')
  @AllowAnonymous()
  async getSetupAdminCompleted() {
    const users = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .limit(1);
    return { setupCompleted: users.length > 0 };
  }

  @Patch('me/language')
  async updateLanguage(
    @Session() session: UserSession,
    @Body() dto: UpdateLanguageDto,
  ): Promise<{ success: boolean }> {
    await this.usersService.updateLanguage(session.user.id, dto.language);
    return { success: true };
  }

  @Get('me/language')
  async getLanguage(@Session() session: UserSession): Promise<{ language: string }> {
    const language = await this.usersService.getLanguage(session.user.id);
    return { language };
  }

  @Get('me/permissions')
  async getMyPermissions(@Session() session: UserSession) {
    return this.usersService.getPermissions(session.user.id);
  }

  @Patch('me/theme')
  async updateTheme(
    @Session() session: UserSession,
    @Body() dto: UpdateThemeDto,
  ): Promise<{ success: boolean }> {
    await this.usersService.updateTheme(session.user.id, dto.theme);
    return { success: true };
  }

  @Get('me/theme')
  async getTheme(@Session() session: UserSession): Promise<{ theme: string }> {
    const theme = await this.usersService.getTheme(session.user.id);
    return { theme };
  }
}
