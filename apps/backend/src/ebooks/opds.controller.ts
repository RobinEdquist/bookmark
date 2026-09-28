import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBasicAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import * as express from 'express';
import { OpdsService } from './opds.service';
import { EbookGroupErrorResponseDto } from './dto/ebook-group-response.dto';
import { OpdsAuthGuard } from '../common/guards/opds-auth.guard';
import { resolveExternalBaseUrl } from '../common/utils/opds-base-url.util';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';

@ApiTags('OPDS')
// Every OPDS route accepts either scheme: HTTP Basic (any username, API key as
// the password) or `Authorization: Bearer bkmrk_…`. ApiTokenMiddleware resolves
// both, so document both on the whole surface — readers differ in what they
// support. A session cookie also works but no OPDS client uses one.
@ApiBasicAuth()
@ApiSecurity('api-key')
@Controller('ebooks/opds')
@AllowAnonymous() // Skip global auth - OpdsAuthGuard handles authentication
@UseGuards(OpdsAuthGuard)
export class OpdsController {
  constructor(private readonly opdsService: OpdsService) {}

  private getBaseUrl(req: express.Request): string {
    return resolveExternalBaseUrl(req, '/api/ebooks/opds');
  }

  private sendXml(res: express.Response, xml: string): void {
    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  }

  @Get()
  @ApiOperation({
    summary: 'Get OPDS root catalog',
    description:
      'Returns the OPDS root catalog with links to browse by all, authors, series, or group. Requires HTTP Basic auth or a Bearer API key.',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  async getRootCatalog(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildRootCatalog(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('all')
  @ApiOperation({
    summary: 'Get all ebooks feed',
    description: 'Returns a paginated OPDS feed of all ebooks in the library',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number for pagination (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  async getAllEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const pageNum = page ? parseInt(page, 10) : 1;
    const xml = await this.opdsService.buildAllEbooksFeed(
      baseUrl,
      user.id,
      pageNum,
    );
    this.sendXml(res, xml);
  }

  @Get('authors')
  @ApiOperation({
    summary: 'Get authors navigation',
    description: 'Returns an OPDS navigation feed listing all authors',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  async getAuthors(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildAuthorsNavigationFeed(
      baseUrl,
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('authors/:id')
  @ApiOperation({
    summary: 'Get author ebooks',
    description:
      'Returns an OPDS acquisition feed of ebooks by a specific author',
  })
  @ApiParam({ name: 'id', description: 'Author UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  @ApiResponse({ status: 404, description: 'Author not found' })
  async getAuthorEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const baseUrl = this.getBaseUrl(req);
    try {
      const xml = await this.opdsService.buildAuthorFeed(baseUrl, id, user.id);
      this.sendXml(res, xml);
    } catch {
      throw new NotFoundException('Author not found');
    }
  }

  @Get('series')
  @ApiOperation({
    summary: 'Get series navigation',
    description: 'Returns an OPDS navigation feed listing all series',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  async getSeries(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildSeriesNavigationFeed(
      baseUrl,
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('series/:id')
  @ApiOperation({
    summary: 'Get series ebooks',
    description:
      'Returns an OPDS acquisition feed of ebooks in a specific series',
  })
  @ApiParam({ name: 'id', description: 'Series UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
  })
  @ApiResponse({ status: 404, description: 'Series not found' })
  async getSeriesEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const baseUrl = this.getBaseUrl(req);
    try {
      const xml = await this.opdsService.buildSeriesFeed(baseUrl, id, user.id);
      this.sendXml(res, xml);
    } catch {
      throw new NotFoundException('Series not found');
    }
  }

  @Get('groups')
  @ApiOperation({
    summary: 'Get group navigation',
    description:
      'Lists groups with available ebooks visible to the reader, sorted by sort name or name. Empty groups are omitted. Requires OPDS to be enabled and either HTTP Basic auth or a Bearer API key.',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom XML feed',
    content: { 'application/atom+xml': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
    type: EbookGroupErrorResponseDto,
    headers: {
      'WWW-Authenticate': {
        schema: { type: 'string', example: 'Basic realm="OPDS"' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'OPDS is disabled',
    type: EbookGroupErrorResponseDto,
  })
  async getGroups(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildGroupsNavigationFeed(
      baseUrl,
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('groups/:id')
  @ApiOperation({
    summary: 'Get group ebooks',
    description:
      'Returns a paginated feed of available ebooks visible to the reader in group order. A membership role is included in the summary. A group with no visible available members returns an empty feed. Requires OPDS to be enabled and either HTTP Basic auth or a Bearer API key.',
  })
  @ApiParam({ name: 'id', description: 'Ebook group UUID', format: 'uuid' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number for pagination (default: 1)',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom XML feed',
    content: { 'application/atom+xml': { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth or a Bearer API key',
    type: EbookGroupErrorResponseDto,
    headers: {
      'WWW-Authenticate': {
        schema: { type: 'string', example: 'Basic realm="OPDS"' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid group UUID',
    type: EbookGroupErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Ebook group not found or OPDS is disabled',
    type: EbookGroupErrorResponseDto,
  })
  async getGroupEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const pageNum = page ? parseInt(page, 10) : 1;
    const xml = await this.opdsService.buildGroupFeed(
      baseUrl,
      id,
      user.id,
      pageNum,
    );
    this.sendXml(res, xml);
  }
}
