import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
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
import { ListsService } from './lists.service';
import {
  CreateListDto,
  UpdateListDto,
  AddItemDto,
  ReorderItemsDto,
} from './dto';

@ApiTags('Lists')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all lists',
    description: 'Returns user lists and public lists from other users',
  })
  @ApiResponse({ status: 200, description: 'Lists grouped by ownership' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.listsService.findAll(user.id);
  }

  @Get('for-item')
  @ApiOperation({
    summary: 'Get lists for item',
    description:
      'Returns user lists with a flag indicating if each contains the specified item',
  })
  @ApiQuery({ name: 'itemType', enum: ['audiobook', 'ebook'] })
  @ApiQuery({ name: 'itemId', type: String })
  @ApiResponse({ status: 200, description: 'Lists with containsItem flag' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getListsForItem(
    @Query('itemType') itemType: 'audiobook' | 'ebook',
    @Query('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listsService.getListsForItem(user.id, itemType, itemId);
  }

  @Get('recent')
  @ApiOperation({
    summary: 'Get recently updated lists',
    description:
      'Returns user lists and public lists from others, sorted by most recently updated',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max lists to return (default 12, max 50)',
  })
  @ApiResponse({ status: 200, description: 'Recently updated lists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findRecent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(
      Math.max(parseInt(limit || '12', 10) || 12, 1),
      50,
    );
    return this.listsService.findRecent(user.id, parsedLimit);
  }

  @Get('top')
  @ApiOperation({
    summary: 'Get top-rated library items',
    description:
      'Returns top items ranked by weighted rating score and by most votes, preferring Goodreads ratings when available',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max items to return (default 10, max 50)',
  })
  @ApiResponse({ status: 200, description: 'Top-ranked items' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findTop(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(
      Math.max(parseInt(limit || '10', 10) || 10, 1),
      50,
    );
    return this.listsService.findTop(user.id, parsedLimit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get list by ID',
    description:
      'Returns a list with its items. Accessible if owner or public.',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiResponse({ status: 200, description: 'List with items' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not owner and not public',
  })
  @ApiResponse({ status: 404, description: 'List not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listsService.findById(id, user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a list',
    description: 'Creates a new list for the current user',
  })
  @ApiResponse({ status: 201, description: 'List created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Body() dto: CreateListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a list',
    description: 'Updates list name and/or visibility',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiResponse({ status: 200, description: 'List updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a list',
    description: 'Deletes a list and all its items',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiResponse({ status: 204, description: 'List deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.listsService.delete(id, user.id);
  }

  @Post(':id/items')
  @ApiOperation({
    summary: 'Add item to list',
    description: 'Adds an audiobook or ebook to a list',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiResponse({ status: 201, description: 'Item added' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  @ApiResponse({ status: 404, description: 'List or item not found' })
  @ApiResponse({ status: 409, description: 'Item already in list' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listsService.addItem(id, user.id, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove item from list',
    description: 'Removes an item from a list',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiParam({ name: 'itemId', description: 'List item ID' })
  @ApiResponse({ status: 204, description: 'Item removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  @ApiResponse({ status: 404, description: 'List or item not found' })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.listsService.removeItem(id, itemId, user.id);
  }

  @Patch(':id/items/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reorder list items',
    description: 'Updates the order of items in a list',
  })
  @ApiParam({ name: 'id', description: 'List ID' })
  @ApiResponse({ status: 204, description: 'Items reordered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async reorderItems(
    @Param('id') id: string,
    @Body() dto: ReorderItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.listsService.reorderItems(id, user.id, dto);
  }
}
