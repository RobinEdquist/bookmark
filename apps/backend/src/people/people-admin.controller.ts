import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { PeopleAdminService } from './people-admin.service';
import { RenamePersonDto } from './dto/rename-person.dto';
import { SplitPersonDto } from './dto/split-person.dto';
import {
  AdminPeopleResponseDto,
  AdminPersonDto,
  MergePersonResultDto,
  RenamePersonConflictDto,
  SplitPersonResultDto,
} from './dto/admin-person.dto';

@ApiTags('People Admin')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AdminGuard)
@Controller('admin/people')
export class PeopleAdminController {
  constructor(private readonly peopleAdminService: PeopleAdminService) {}

  @Get('authors')
  @ApiOperation({
    summary: 'List all authors',
    description:
      'Returns all people with author links, including counts for ebooks and audiobooks.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter authors by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of authors with counts',
    type: AdminPeopleResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAuthors(
    @Query('search') search?: string,
  ): Promise<AdminPeopleResponseDto> {
    const people = await this.peopleAdminService.findAuthors(search);
    return { people };
  }

  @Get('narrators')
  @ApiOperation({
    summary: 'List all narrators',
    description:
      'Returns all people with narrator links and counts for audiobooks.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Filter narrators by name',
  })
  @ApiResponse({
    status: 200,
    description: 'List of narrators with counts',
    type: AdminPeopleResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findNarrators(
    @Query('search') search?: string,
  ): Promise<AdminPeopleResponseDto> {
    const people = await this.peopleAdminService.findNarrators(search);
    return { people };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename person',
    description:
      'Rename a person. Returns conflict info if a name already exists.',
  })
  @ApiParam({ name: 'id', description: 'Person ID' })
  @ApiResponse({ status: 200, description: 'Person renamed or conflict info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Person not found' })
  async rename(
    @Param('id') id: string,
    @Body() dto: RenamePersonDto,
  ): Promise<AdminPersonDto | RenamePersonConflictDto> {
    return this.peopleAdminService.rename(id, dto.name);
  }

  @Post(':id/merge/:targetId')
  @ApiOperation({
    summary: 'Merge people',
    description:
      'Merge source person into target person and move all author/narrator links.',
  })
  @ApiParam({ name: 'id', description: 'Source person ID (will be deleted)' })
  @ApiParam({ name: 'targetId', description: 'Target person ID (will remain)' })
  @ApiResponse({ status: 200, description: 'People merged successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot merge a person with itself',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Person not found' })
  async merge(
    @Param('id') sourceId: string,
    @Param('targetId') targetId: string,
  ): Promise<MergePersonResultDto> {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a person with itself');
    }
    return this.peopleAdminService.merge(sourceId, targetId);
  }

  @Post(':id/split')
  @ApiOperation({
    summary: 'Split person',
    description:
      'Replace a person with multiple people and move all author/narrator links.',
  })
  @ApiParam({ name: 'id', description: 'Source person ID' })
  @ApiResponse({
    status: 200,
    description: 'Person split successfully',
    type: SplitPersonResultDto,
  })
  @ApiResponse({
    status: 400,
    description: 'At least two replacement names are required',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Person not found' })
  async split(
    @Param('id') id: string,
    @Body() dto: SplitPersonDto,
  ): Promise<SplitPersonResultDto> {
    return this.peopleAdminService.split(id, dto.names);
  }
}
