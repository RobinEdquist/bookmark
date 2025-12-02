import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { auth } from '../../auth/auth';

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

    // Extract Basic Auth credentials
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
      throw new UnauthorizedException('Authentication required');
    }

    // Decode Basic Auth (format: "Basic base64(username:password)")
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [, apiToken] = credentials.split(':');

    if (!apiToken) {
      response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify API token using Better Auth
    try {
      const result = await auth.api.verifyApiKey({
        body: { key: apiToken },
      });

      if (!result.valid) {
        response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
        throw new UnauthorizedException('Invalid API key');
      }

      // Attach user info to request for potential future use
      (request as any).apiKeyUser = result.key;
      return true;
    } catch (error) {
      response.setHeader('WWW-Authenticate', 'Basic realm="OPDS"');
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
