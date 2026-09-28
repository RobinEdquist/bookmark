import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import * as express from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { AuthGuard } from '../common/guards/auth.guard';
import { CanDeleteGuard } from '../common/guards/can-delete.guard';
import { CanEditMetadataGuard } from '../common/guards/can-edit-metadata.guard';
import {
  createContentETag,
  matchesIfNoneMatch,
} from '../common/http-cache.utils';
import { EbookGroupsService } from './ebook-groups.service';
import {
  AddEbookGroupMemberDto,
  CreateEbookGroupDto,
  ListEbookGroupsQueryDto,
  ReorderEbookGroupMembersDto,
  UpdateEbookGroupDto,
  UpdateEbookGroupMemberDto,
} from './dto/ebook-group.dto';
import {
  EbookGroupCoverResponseDto,
  EbookGroupErrorResponseDto,
  EbookGroupDetailDto,
  EbookGroupIdResponseDto,
  EbookGroupListResponseDto,
  EbookGroupSuccessResponseDto,
} from './dto/ebook-group-response.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';

@ApiTags('Ebooks')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@ApiResponse({
  status: 400,
  description: 'Invalid request body, query, or UUID',
  type: EbookGroupErrorResponseDto,
})
@ApiResponse({
  status: 401,
  description: 'Authentication required',
  type: EbookGroupErrorResponseDto,
})
@Controller('ebooks/groups')
export class EbookGroupsController {
  constructor(private readonly groups: EbookGroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'List ebook groups',
    description:
      'Paginated library groups, including empty groups. Member counts and fallback covers exclude hidden ebooks and the reader’s blacklisted tags. Search matches literal substrings in the name or sort name.',
  })
  @ApiResponse({ status: 200, type: EbookGroupListResponseDto })
  async findAll(
    @Query() query: ListEbookGroupsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EbookGroupListResponseDto> {
    return this.groups.findAll(query, user.id);
  }

  @Post()
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({
    summary: 'Create an ebook group',
    description:
      'Requires the same metadata-edit permission as editing an ebook series. The group is library metadata, shared by every reader.',
  })
  @ApiResponse({ status: 201, type: EbookGroupIdResponseDto })
  async create(
    @Body() dto: CreateEbookGroupDto,
  ): Promise<EbookGroupIdResponseDto> {
    return this.groups.create(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an ebook group and its ebooks',
    description:
      'Members are returned in group order, excluding hidden ebooks and the reader’s blacklisted tags. The cover falls back to the first visible member when no group cover is set.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupDetailDto })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EbookGroupDetailDto> {
    return this.groups.findOne(id, user.id);
  }

  @Patch(':id')
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({ summary: 'Update an ebook group' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEbookGroupDto,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CanDeleteGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires delete permission',
    type: EbookGroupErrorResponseDto,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an ebook group',
    description:
      'Removes the group only. Member ebooks stay in the library. Requires delete permission, matching comic collections.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Group deleted' })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.groups.remove(id);
  }

  @Post(':id/ebooks')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({
    summary: 'Add an ebook to a group',
    description:
      'Appends a new member. For an existing member, preserves its position and updates the role only if supplied.',
  })
  @ApiResponse({
    status: 404,
    description: 'Group or ebook not found',
    type: EbookGroupErrorResponseDto,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  async addEbook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEbookGroupMemberDto,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.addEbook(id, dto);
  }

  @Patch(':id/ebooks/:ebookId')
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({ summary: "Set an ebook's role in a group" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'ebookId', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Group or membership not found',
    type: EbookGroupErrorResponseDto,
  })
  async updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ebookId', ParseUUIDPipe) ebookId: string,
    @Body() dto: UpdateEbookGroupMemberDto,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.updateMember(id, ebookId, dto.role);
  }

  @Delete(':id/ebooks/:ebookId')
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({
    summary: 'Remove an ebook from a group',
    description:
      'Idempotent when the ebook is not a member. The ebook stays in the library.',
  })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'ebookId', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  async removeEbook(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ebookId', ParseUUIDPipe) ebookId: string,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.removeEbook(id, ebookId);
  }

  @Patch(':id/order')
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({
    summary: 'Reorder ebooks in a group',
    description:
      'Pass unique member ebook ids in the new order. Omitted members stay in the group, including members the caller cannot see. Nonmember ids return 400; an empty array leaves the order unchanged.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderEbookGroupMembersDto,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.reorder(id, dto.ebookIds);
  }

  @Post(':id/cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Update an ebook group cover',
    description:
      'Provide exactly one file or URL. File uploads accept JPG, PNG, or WebP; URLs also accept GIF. Max 2 MB. Images are stored as JPEG. URLs must be public HTTP(S) destinations. Requires edit metadata permission.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      oneOf: [
        { required: ['file'], not: { required: ['url'] } },
        { required: ['url'], not: { required: ['file'] } },
      ],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Cover image file (JPG, PNG, or WebP)',
        },
        url: {
          type: 'string',
          format: 'uri',
          description:
            'Public HTTP(S) image URL; may also be sent as a JSON body',
        },
      },
    },
  })
  @ApiResponse({ status: 200, type: EbookGroupCoverResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid UUID, image, URL, or mutually exclusive file/URL input',
    type: EbookGroupErrorResponseDto,
  })
  @ApiResponse({
    status: 413,
    description: 'Uploaded file exceeds 2 MB',
    type: EbookGroupErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Could not fetch the remote image',
    type: EbookGroupErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  async updateCover(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: UpdateCoverDto,
  ): Promise<EbookGroupCoverResponseDto> {
    if (!file && !body?.url) {
      throw new BadRequestException('Either file or url must be provided');
    }
    if (file && body?.url) {
      throw new BadRequestException('Provide either file or url, not both');
    }
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        throw new BadRequestException('File size must be less than 2 MB');
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Allowed: JPG, PNG, WebP',
        );
      }
      return this.groups.updateCoverFromFile(id, file.buffer);
    }
    return this.groups.updateCoverFromUrl(id, body!.url!);
  }

  @Get(':id/cover')
  @ApiOperation({ summary: 'Get an ebook group cover image' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description:
      'Previously returned ETag; a matching value returns 304 without a body',
  })
  @ApiResponse({
    status: 200,
    description:
      'The group’s own cover as JPEG. Use the detail response coverUrl for the member-cover fallback.',
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
    headers: {
      ETag: {
        schema: { type: 'string' },
        description: 'Content-based entity tag',
      },
      'Cache-Control': {
        schema: { type: 'string', example: 'private, no-cache' },
      },
    },
  })
  @ApiResponse({
    status: 304,
    description: 'Cover image not modified; no response body',
    headers: {
      ETag: { schema: { type: 'string' } },
      'Cache-Control': {
        schema: { type: 'string', example: 'private, no-cache' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Group or own cover not found',
    type: EbookGroupErrorResponseDto,
  })
  async getCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: express.Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const cover = await this.groups.getCover(id);
    if (!cover) throw new NotFoundException('Cover not found');

    const etag = createContentETag(cover.data);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', cover.mimeType);
    res.setHeader('Content-Length', cover.data.length.toString());
    res.end(cover.data);
  }

  @Delete(':id/cover')
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found',
    type: EbookGroupErrorResponseDto,
  })
  @UseGuards(CanEditMetadataGuard)
  @ApiResponse({
    status: 403,
    description: 'Requires edit metadata permission',
    type: EbookGroupErrorResponseDto,
  })
  @ApiOperation({
    summary: 'Remove an ebook group cover',
    description: 'The group then uses the first member ebook cover.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EbookGroupSuccessResponseDto })
  async clearCover(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EbookGroupSuccessResponseDto> {
    return this.groups.clearCover(id);
  }
}
