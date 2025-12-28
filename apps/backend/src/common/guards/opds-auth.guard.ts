import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { getAuthenticatedUser } from './auth.guard';

/**
 * Guard for OPDS endpoints.
 *
 * Responsibilities:
 * 1. Check if OPDS feature is enabled
 * 2. Set WWW-Authenticate header for proper e-reader auth prompts
 *
 * Note: Actual API key validation is handled by ApiTokenMiddleware.
 * This guard just adds OPDS-specific behavior.
 */
@Injectable()
export class OpdsAuthGuard implements CanActivate {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Check if OPDS is enabled
    const opdsEnabled = await this.appSettingsService.isOpdsEnabled();
    if (!opdsEnabled) {
      throw new NotFoundException('Not Found');
    }

    // Check if user is authenticated (via middleware)
    const user = getAuthenticatedUser(request);
    if (!user) {
      // Set WWW-Authenticate header for e-reader auth prompts
      response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}
