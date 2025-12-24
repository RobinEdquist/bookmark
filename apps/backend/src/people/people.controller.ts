import {
  Controller,
  Get,
  Param,
  Res,
  Header,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs/promises';
import { AppDataService } from '../app-data/app-data.service';

@ApiTags('People')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@UseGuards(AuthGuard)
@Controller('people')
export class PeopleController {
  constructor(private readonly appDataService: AppDataService) {}

  @Get(':id/image')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({
    summary: 'Get person image',
    description:
      'Returns the image for an author or narrator. Cached for 24 hours.',
  })
  @ApiParam({ name: 'id', description: 'Person UUID' })
  @ApiResponse({ status: 200, description: 'Person image (JPEG)' })
  @ApiResponse({ status: 404, description: 'Person image not found' })
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
