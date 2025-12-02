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
import * as express from 'express';
import { OpdsService } from './opds.service';
import { OpdsAuthGuard } from '../common/guards/opds-auth.guard';

@Controller('ebooks/opds')
@UseGuards(OpdsAuthGuard)
export class OpdsController {
  constructor(private readonly opdsService: OpdsService) {}

  private getBaseUrl(req: express.Request): string {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    return `${protocol}://${host}/api/ebooks/opds`;
  }

  private sendXml(res: express.Response, xml: string): void {
    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    res.send(xml);
  }

  @Get()
  async getRootCatalog(@Req() req: express.Request, @Res() res: express.Response) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildRootCatalog(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('all')
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
  async getAuthors(@Req() req: express.Request, @Res() res: express.Response) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildAuthorsNavigationFeed(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('authors/:id')
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
  async getSeries(@Req() req: express.Request, @Res() res: express.Response) {
    const baseUrl = this.getBaseUrl(req);
    const xml = await this.opdsService.buildSeriesNavigationFeed(baseUrl);
    this.sendXml(res, xml);
  }

  @Get('series/:id')
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
