import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
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
  private readonly logger = new Logger(OpdsAuthGuard.name);

  constructor(private readonly appSettingsService: AppSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const reqPath = request.path;
    const reqMethod = request.method;

    // Check if OPDS is enabled
    const opdsEnabled = await this.appSettingsService.isOpdsEnabled();
    if (!opdsEnabled) {
      this.logger.warn(
        `[opds-auth] OPDS disabled — rejecting request method=${reqMethod} path=${reqPath}`,
      );
      throw new NotFoundException('Not Found');
    }

    // Check if user is authenticated (via middleware)
    const user = getAuthenticatedUser(request);
    if (!user) {
      const authHeader = request.headers['authorization'];
      const authHeaderPresent = !!authHeader;
      const scheme = authHeaderPresent
        ? (authHeader.split(' ')[0] ?? 'unknown')
        : 'none';
      this.logger.warn(
        `[opds-auth] auth failed method=${reqMethod} path=${reqPath} authHeaderPresent=${authHeaderPresent} scheme=${scheme}`,
      );
      // Set WWW-Authenticate header for e-reader auth prompts
      response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
      throw new UnauthorizedException('Authentication required');
    }

    this.logger.log(
      `[opds-auth] authenticated userId=${user.id} method=${reqMethod} path=${reqPath}`,
    );
    return true;
  }
}
