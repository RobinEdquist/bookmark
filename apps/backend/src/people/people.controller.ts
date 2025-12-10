import {
  Controller,
  Get,
  Param,
  Res,
  Header,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs/promises';
import { AppDataService } from '../app-data/app-data.service';

@Controller('people')
export class PeopleController {
  constructor(private readonly appDataService: AppDataService) {}

  @Get(':id/image')
  @Header('Cache-Control', 'public, max-age=86400')
  async getImage(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const imagePath = this.appDataService.getPersonImagePath(id);

    try {
      const data = await fs.readFile(imagePath);
      res.set('Content-Type', 'image/jpeg');
      res.send(data);
    } catch {
      throw new NotFoundException('Person image not found');
    }
  }
}
