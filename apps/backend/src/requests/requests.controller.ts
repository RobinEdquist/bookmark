import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import { CanRequestGuard } from '../common/guards/can-request.guard';
import { TrackerService } from '../tracker';
import { RequestsService } from './requests.service';
import { TrackerSearchDto, CreateRequestDto } from './dto';
import {
  TrackerSearchResponseDto,
  TrackerLanguagesResponseDto,
  ContentRequestDto,
  AutoApproveBudgetDto,
} from './dto/request-response.dto';

@ApiTags('Requests')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('requests')
@UseGuards(CanRequestGuard)
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly tracker: TrackerService,
  ) {}

  @Get('cover/:id')
  @ApiOperation({
    summary: 'Proxy torrent cover image',
    description: 'Proxies a torrent cover/thumbnail image from the tracker',
  })
  @ApiParam({ name: 'id', description: 'Torrent ID' })
  @ApiResponse({ status: 200, description: 'Image data' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async proxyImage(@Param('id') id: string, @Res() res: Response) {
    await this.tracker.proxyImage(id, res);
  }

  @Get('languages')
  @ApiOperation({
    summary: 'List searchable content languages',
    description:
      "Returns the content request module's language taxonomy for the search filter. Empty when the module has none.",
  })
  @ApiResponse({
    status: 200,
    description: 'Available languages',
    type: TrackerLanguagesResponseDto,
  })
  @ApiResponse({
    status: 'default',
    description:
      'Module language lookup failures propagate the upstream HTTP status, or 503 when unreachable. The module must implement GET /languages.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getLanguages(): Promise<TrackerLanguagesResponseDto> {
    return this.requestsService.getLanguages();
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search for content to request',
    description:
      'Search the tracker catalog for audiobooks, ebooks, or all content types',
  })
  @ApiResponse({
    status: 201,
    description: 'Search results with request status',
    type: TrackerSearchResponseDto,
  })
  @ApiResponse({
    status: 502,
    description:
      'Module search response does not satisfy the current book request contract',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async search(
    @Body() dto: TrackerSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.search(
      dto.query,
      dto.perPage ?? 25,
      dto.offset ?? 0,
      user.id,
      dto.contentType ?? 'all',
      dto.searchIn,
      dto.languages,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get my requests',
    description:
      'Returns requests created or supported by the current user, each once. The response is an array, including waiting requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user requests',
    type: [ContentRequestDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getMyRequests(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentRequestDto[]> {
    return this.requestsService.getUserRequests(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new request',
    description:
      'Request a book by title, optional author, medium, and accepted languages, with or without a selected release. A compatible active request by another user is supported and returned instead of creating a duplicate. Compatibility uses normalized title/author, medium, and language intent. Automatic approval uses the caller’s weekly allowance once; an approved request without a release waits for availability. Release discovery on a pending request does not bypass approval.',
  })
  @ApiExtraModels(CreateRequestDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(CreateRequestDto) },
        {
          oneOf: [
            {
              title: 'Book without a selected release',
              properties: {
                torrentId: { type: 'integer', nullable: true, enum: [null] },
              },
            },
            {
              title: 'Selected release',
              required: ['torrentId', 'categoryId'],
              properties: { torrentId: { type: 'integer', minimum: 1 } },
            },
          ],
        },
      ],
    },
    examples: {
      book: {
        summary: 'Request a book before a release exists',
        value: {
          title: 'The Hobbit',
          author: 'J.R.R. Tolkien',
          contentType: 'audiobook',
        },
      },
      release: {
        summary: 'Request a selected search result',
        value: {
          title: 'The Hobbit',
          author: 'J.R.R. Tolkien',
          contentType: 'audiobook',
          torrentId: 123456,
          categoryId: 13,
          language: 'English',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'New request or compatible existing request supported by the caller',
    type: ContentRequestDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, missing category for a selected release, unavailable or mismatched language, or the caller already owns a compatible active request',
  })
  @ApiResponse({
    status: 'default',
    description:
      'Module language lookup failures propagate the upstream HTTP status, or 503 when the module is unreachable',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async createRequest(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentRequestDto> {
    return this.requestsService.createRequest(dto, user.id);
  }

  @Post(':id/support')
  @ApiOperation({
    summary: 'Support a request',
    description:
      'Add your support to an existing request to help prioritize it',
  })
  @ApiParam({ name: 'id', description: 'Request UUID', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Support added successfully',
    type: ContentRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 400, description: 'Cannot support your own request' })
  async supportRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContentRequestDto> {
    await this.requestsService.addSupporter(id, user.id);
    return this.requestsService.getRequestById(id, user.id);
  }

  @Get('auto-approve-budget')
  @ApiOperation({
    summary: 'Get auto-approve budget',
    description:
      'Returns how many auto-approved requests the user can make this week',
  })
  @ApiResponse({
    status: 200,
    description:
      'Auto-approve budget with used, limit, remaining, and reset time',
    type: AutoApproveBudgetDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - user cannot make requests',
  })
  async getAutoApproveBudget(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AutoApproveBudgetDto> {
    const { used, limit } = await this.requestsService.getUserAutoApproveUsage(
      user.id,
    );

    // Calculate next Monday 00:00 UTC
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: nextMonday.toISOString(),
    };
  }
}
