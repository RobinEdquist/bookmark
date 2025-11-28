import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HardcoverService } from './hardcover.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

interface ValidateKeyDto {
  apiKey: string;
}

@Controller('hardcover')
@UseGuards(RolesGuard)
@Roles('admin')
export class HardcoverController {
  constructor(private readonly hardcoverService: HardcoverService) {}

  @Get('status')
  async getStatus() {
    const apiKey = await this.hardcoverService.getApiKey();
    return {
      configured: !!apiKey,
    };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateKey(@Body() dto: ValidateKeyDto) {
    if (!dto.apiKey || typeof dto.apiKey !== 'string') {
      throw new BadRequestException('API key is required');
    }

    const result = await this.hardcoverService.validateApiKey(dto.apiKey);

    if (result.valid) {
      await this.hardcoverService.setApiKey(dto.apiKey);
    }

    return result;
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect() {
    await this.hardcoverService.setApiKey(null);
    return { success: true };
  }

  @Get('search')
  async search(@Query('q') query: string) {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Search query is required');
    }

    const result = await this.hardcoverService.searchBooks(query);

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return result.data;
  }
}
