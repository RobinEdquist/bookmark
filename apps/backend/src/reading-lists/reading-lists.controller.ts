import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';
import { ReadingListsService } from './reading-lists.service';
import type { ReadingListEntryInput } from './reading-list-order';
import {
  AddReadingListItemsDto,
  CreateReadingListDto,
  ListReadingListsQueryDto,
  ReorderReadingListDto,
  UpdateReadingListDto,
  UpdateReadingListEntryDto,
} from './dto/reading-list.dto';
import {
  ReadingListAddResultDto,
  ReadingListDetailDto,
  ReadingListIdResponseDto,
  ReadingListListResponseDto,
  ReadingListSuccessResponseDto,
} from './dto/reading-list-response.dto';

/**
 * Reading lists are shared: any signed-in user can read them, editing needs
 * permission to edit metadata and deleting needs permission to delete, as for
 * comic collections.
 */
@ApiTags('Reading lists')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('reading-lists')
export class ReadingListsController {
  constructor(private readonly readingLists: ReadingListsService) {}

  @Get()
  @ApiOperation({ summary: 'List reading lists' })
  @ApiResponse({ status: 200, type: ReadingListListResponseDto })
  async findAll(
    @Query() query: ListReadingListsQueryDto,
  ): Promise<ReadingListListResponseDto> {
    return this.readingLists.findAll(query);
  }

  @Post()
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Create a reading list' })
  @ApiResponse({ status: 201, type: ReadingListIdResponseDto })
  async create(
    @Body() dto: CreateReadingListDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReadingListIdResponseDto> {
    return this.readingLists.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a reading list with its items in order' })
  @ApiResponse({ status: 200, type: ReadingListDetailDto })
  @ApiResponse({ status: 404, description: 'Reading list not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReadingListDetailDto> {
    return this.readingLists.findOne(id, user.id);
  }

  @Patch(':id')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Update a reading list' })
  @ApiResponse({ status: 200, type: ReadingListSuccessResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReadingListDto,
  ): Promise<ReadingListSuccessResponseDto> {
    return this.readingLists.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CanDeleteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a reading list' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.readingLists.remove(id);
  }

  @Post(':id/items')
  @UseGuards(CanEditMetadataGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add items to a reading list',
    description:
      'Adds items in the order given, at `position` or at the end. Items already in the list stay where they are. ' +
      '`entries` can name missing items, which become the real item once the library has it (comics: by ComicVine issue, or volume and number).',
  })
  @ApiResponse({ status: 200, type: ReadingListAddResultDto })
  async addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddReadingListItemsDto,
  ): Promise<ReadingListAddResultDto> {
    const inputs: ReadingListEntryInput[] = [
      ...(dto.itemIds ?? []).map((itemId) => ({ itemId })),
      ...(dto.entries ?? []).map((entry): ReadingListEntryInput => {
        if (entry.itemId && !entry.missing) return { itemId: entry.itemId };
        if (entry.missing && !entry.itemId) return { missing: entry.missing };
        throw new BadRequestException(
          'Each entry needs either itemId or missing',
        );
      }),
    ];
    if (inputs.length === 0) {
      throw new BadRequestException('Give itemIds or entries');
    }
    return this.readingLists.addEntries(id, inputs, {
      position: dto.position,
      note: dto.note,
    });
  }

  @Patch(':id/items/:itemId')
  @UseGuards(CanEditMetadataGuard)
  @ApiParam({
    name: 'itemId',
    description: "The item's id, or for a missing item the entry id",
  })
  @ApiOperation({
    summary: 'Set the note on a reading list item, or move it',
    description:
      'Fields left out are not changed. `position` moves the item to that 0-based place.',
  })
  @ApiResponse({ status: 200, type: ReadingListSuccessResponseDto })
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateReadingListEntryDto,
  ): Promise<ReadingListSuccessResponseDto> {
    if (dto.note !== undefined) {
      await this.readingLists.setNote(id, itemId, dto.note);
    }
    if (dto.position !== undefined) {
      await this.readingLists.moveItem(id, itemId, dto.position);
    }
    return { success: true };
  }

  @Delete(':id/items/:itemId')
  @UseGuards(CanEditMetadataGuard)
  @ApiParam({
    name: 'itemId',
    description: "The item's id, or for a missing item the entry id",
  })
  @ApiOperation({ summary: 'Remove an item from a reading list' })
  @ApiResponse({ status: 200, type: ReadingListSuccessResponseDto })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ReadingListSuccessResponseDto> {
    const removed = await this.readingLists.removeItems(id, [itemId]);
    if (removed === 0) throw new NotFoundException('Not in this reading list');
    return { success: true };
  }

  @Patch(':id/order')
  @UseGuards(CanEditMetadataGuard)
  @ApiOperation({ summary: 'Set the order of a reading list' })
  @ApiResponse({ status: 200, type: ReadingListSuccessResponseDto })
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderReadingListDto,
  ): Promise<ReadingListSuccessResponseDto> {
    return this.readingLists.reorder(id, dto.itemIds);
  }
}
