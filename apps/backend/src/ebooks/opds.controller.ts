import {
  Controller,
  Get,
  Param,
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
} from '@nestjs/swagger';
import * as express from 'express';
import { OpdsService } from './opds.service';
import { OpdsAuthGuard } from '../common/guards/opds-auth.guard';

@ApiTags('OPDS')
@ApiBasicAuth()
@Controller('ebooks/opds')
@UseGuards(OpdsAuthGuard)
export class OpdsController {
  constructor(private readonly opdsService: OpdsService) {}

  private getBaseUrl(req: express.Request): string {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host =
      req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    return `${protocol}://${host}/api/ebooks/opds`;
  }

  private sendXml(res: express.Response, xml: string): void {
    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  }

  @Get()
  @ApiOperation({
    summary: 'Get OPDS root catalog',
    description:
      'Returns the OPDS root catalog with links to browse by all, authors, or series. Requires HTTP Basic authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
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
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getAllEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('page') page?: string,
  ) {
    const baseUrl = this.getBaseUrl(req);
    const pageNum = page ? parseInt(page, 10) : 1;
    const xml = await this.opdsService.buildAllEbooksFeed(baseUrl, pageNum);
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
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getAuthors(@Req() req: express.Request, @Res() res: express.Response) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildAuthorsNavigationFeed(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('authors/:id')
  @ApiOperation({
    summary: 'Get author ebooks',
    description:
      'Returns an OPDS acquisition feed of ebooks by a specific author',
  })
  @ApiParam({ name: 'id', description: 'Author UUID' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  @ApiResponse({ status: 404, description: 'Author not found' })
  async getAuthorEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
  ) {
    const baseUrl = this.getBaseUrl(req);
    try {
      const xml = await this.opdsService.buildAuthorFeed(baseUrl, id);
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
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  async getSeries(@Req() req: express.Request, @Res() res: express.Response) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildSeriesNavigationFeed(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('series/:id')
  @ApiOperation({
    summary: 'Get series ebooks',
    description:
      'Returns an OPDS acquisition feed of ebooks in a specific series',
  })
  @ApiParam({ name: 'id', description: 'Series UUID' })
  @ApiResponse({
    status: 200,
    description: 'OPDS Atom feed (application/atom+xml)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - requires HTTP Basic auth',
  })
  @ApiResponse({ status: 404, description: 'Series not found' })
  async getSeriesEbooks(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Param('id') id: string,
  ) {
    const baseUrl = this.getBaseUrl(req);
    try {
      const xml = await this.opdsService.buildSeriesFeed(baseUrl, id);
      this.sendXml(res, xml);
    } catch {
      throw new NotFoundException('Series not found');
    }
  }
}
