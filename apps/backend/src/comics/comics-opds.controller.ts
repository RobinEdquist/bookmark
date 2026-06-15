import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import * as express from 'express';
import { ComicsOpdsService } from './comics-opds.service';
import { ComicPageService } from './comic-page.service';
import { ComicsService } from './comics.service';
import { ComicProgressService } from '../comic-progress/comic-progress.service';
import { OpdsAuthGuard } from '../common/guards/opds-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/guards/auth.guard';

@ApiTags('OPDS')
@ApiBasicAuth()
@Controller('comics/opds')
@AllowAnonymous() // Skip global auth - OpdsAuthGuard handles authentication
@UseGuards(OpdsAuthGuard)
export class ComicsOpdsController {
  private readonly logger = new Logger(ComicsOpdsController.name);

  constructor(
    private readonly opds: ComicsOpdsService,
    private readonly pageService: ComicPageService,
    private readonly comicsService: ComicsService,
    private readonly progressService: ComicProgressService,
  ) {}

  private getBaseUrl(req: express.Request): string {
    const xForwardedProto = req.headers['x-forwarded-proto'];
    const xForwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = req.headers.host;
    const reqProtocol = req.protocol;
    const protocol = xForwardedProto || reqProtocol || 'http';
    const host = xForwardedHost || hostHeader || 'localhost';
    const baseUrl = `${protocol}://${host}/api/comics/opds`;
    this.logger.log(
      `[comics-opds] getBaseUrl resolved=${baseUrl} x-forwarded-proto=${xForwardedProto ?? 'absent'} x-forwarded-host=${xForwardedHost ?? 'absent'} host=${hostHeader ?? 'absent'} req.protocol=${reqProtocol}`,
    );
    return baseUrl;
  }

  private sendXml(res: express.Response, xml: string): void {
    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  }

  @Get()
  @ApiOperation({
    summary: 'Get OPDS root catalog (comics)',
    description:
      'Returns the OPDS root catalog with links to browse by series, publishers, collections, on deck, and recent. Requires HTTP Basic authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getRoot(@Req() req: express.Request, @Res() res: express.Response) {
    this.logger.log(`[comics-opds] GET / (root catalog)`);
    const xml = await this.opds.buildRootCatalog(this.getBaseUrl(req));
    this.sendXml(res, xml);
  }

  @Get('series')
  @ApiOperation({ summary: 'All comic series (navigation feed)' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getAllSeries(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`[comics-opds] GET /series user=${user.id}`);
    const xml = await this.opds.buildAllSeriesFeed(
      this.getBaseUrl(req),
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('series/:id')
  @ApiOperation({ summary: 'Issues in a series (acquisition feed)' })
  @ApiParam({ name: 'id', description: 'Series UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  @ApiResponse({ status: 404, description: 'Series not found' })
  async getSeries(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`[comics-opds] GET /series/:id id=${id} user=${user.id}`);
    try {
      // Guard: deny access if the series is blacklisted for this user
      await this.comicsService.verifySeriesNotBlacklisted(id, user.id);
      const xml = await this.opds.buildSeriesFeed(
        this.getBaseUrl(req),
        id,
        user.id,
      );
      this.sendXml(res, xml);
    } catch (err) {
      this.logger.error(
        `[comics-opds] getSeries failed id=${id} user=${user.id}: ${err}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  @Get('publishers')
  @ApiOperation({ summary: 'Publishers navigation feed' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getPublishers(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`[comics-opds] GET /publishers user=${user.id}`);
    const xml = await this.opds.buildPublishersFeed(
      this.getBaseUrl(req),
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('publishers/:publisher')
  @ApiOperation({ summary: 'Series for a publisher (navigation feed)' })
  @ApiParam({ name: 'publisher', description: 'Publisher name (URL-encoded)' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getPublisherSeries(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('publisher') publisher: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(
      `[comics-opds] GET /publishers/:publisher publisher=${publisher} user=${user.id}`,
    );
    const xml = await this.opds.buildPublisherSeriesFeed(
      this.getBaseUrl(req),
      decodeURIComponent(publisher),
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Comic collections (navigation feed)' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getCollections(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    this.logger.log(`[comics-opds] GET /collections`);
    const xml = await this.opds.buildCollectionsFeed(this.getBaseUrl(req));
    this.sendXml(res, xml);
  }

  @Get('collections/:id')
  @ApiOperation({ summary: 'Series in a collection (navigation feed)' })
  @ApiParam({ name: 'id', description: 'Collection UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  async getCollection(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(
      `[comics-opds] GET /collections/:id id=${id} user=${user.id}`,
    );
    // Service throws NotFoundException directly when collection is missing — let it propagate
    const xml = await this.opds.buildCollectionFeed(
      this.getBaseUrl(req),
      id,
      user.id,
    );
    this.sendXml(res, xml);
  }

  @Get('on-deck')
  @ApiOperation({
    summary: 'In-progress issues (Continue Reading, acquisition feed)',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getOnDeck(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`[comics-opds] GET /on-deck user=${user.id}`);
    const xml = await this.opds.buildOnDeckFeed(this.getBaseUrl(req), user.id);
    this.sendXml(res, xml);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Recently added issues (acquisition feed)' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getRecent(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(`[comics-opds] GET /recent user=${user.id}`);
    const xml = await this.opds.buildRecentFeed(this.getBaseUrl(req), user.id);
    this.sendXml(res, xml);
  }

  @Get('books/:id/pages/:page')
  @ApiOperation({
    summary: 'OPDS-PSE page stream endpoint (zero-based page index)',
    description:
      'Serves a single comic page as JPEG. Supports optional width/height resize parameters. ' +
      'Records read progress server-side (fire-and-forget) so pse:lastRead stays current.',
  })
  @ApiParam({ name: 'id', description: 'Comic book UUID', format: 'uuid' })
  @ApiParam({ name: 'page', description: 'Zero-based page index' })
  @ApiQuery({
    name: 'width',
    required: false,
    description: 'Max page width in pixels',
  })
  @ApiQuery({
    name: 'height',
    required: false,
    description: 'Max page height in pixels',
  })
  @ApiResponse({ status: 200, description: 'Page image (JPEG)' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  @ApiResponse({
    status: 403,
    description: 'Book is blacklisted for this user',
  })
  @ApiResponse({ status: 404, description: 'Book or page not found' })
  async streamPage(
    @Param('id') id: string,
    @Param('page') page: string,
    @Res() res: express.Response,
    @CurrentUser() user: AuthenticatedUser,
    @Query('width') width?: string,
    @Query('height') height?: string,
  ) {
    // NOTE: Although this handler uses @Res() directly, NotFoundException /
    // ForbiddenException thrown below (from verifyBookNotBlacklisted or
    // getPageImage) still propagate to Nest's exception filter and produce
    // proper 403/404 responses — the response is only sent manually on the
    // success path. This mirrors the ebooks OPDS controller.

    this.logger.log(
      `[comics-opds] streamPage request bookId=${id} page=${page} width=${width ?? 'unset'} height=${height ?? 'unset'} user=${user.id}`,
    );

    try {
      // Guard: deny access if the book's series is blacklisted for this user.
      // Also throws NotFoundException if the book doesn't exist.
      await this.comicsService.verifyBookNotBlacklisted(id, user.id);

      const pageIndex = parseInt(page, 10);
      if (Number.isNaN(pageIndex)) {
        throw new NotFoundException('Invalid page');
      }

      const parsedWidth = width !== undefined ? parseInt(width, 10) : undefined;
      const parsedHeight =
        height !== undefined ? parseInt(height, 10) : undefined;
      const maxWidth =
        parsedWidth !== undefined && !Number.isNaN(parsedWidth)
          ? parsedWidth
          : undefined;
      const maxHeight =
        parsedHeight !== undefined && !Number.isNaN(parsedHeight)
          ? parsedHeight
          : undefined;

      const { data, pageCount } = await this.pageService.getPageImage(
        id,
        pageIndex,
        {
          maxWidth,
          maxHeight,
        },
      );

      this.logger.log(
        `[comics-opds] streamPage getPageImage done bookId=${id} pageIndex=${pageIndex} bytes=${data.length} pageCount=${pageCount}`,
      );

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      this.logger.log(
        `[comics-opds] streamPage sending response bookId=${id} pageIndex=${pageIndex} bytes=${data.length}`,
      );
      res.send(data);

      // Infer read progress from the page request (OPDS-PSE has no client->server
      // sync). Fire-and-forget AFTER the image is sent so delivery is never blocked.
      void this.progressService
        .recordPageView(user.id, id, pageIndex, pageCount)
        .catch((err) =>
          this.logger.warn(
            `[comics-opds] streamPage recordPageView failed bookId=${id} pageIndex=${pageIndex} user=${user.id}: ${err}`,
          ),
        );
    } catch (err) {
      this.logger.error(
        `[comics-opds] streamPage failed bookId=${id} page=${page} user=${user.id}: ${err}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}
