import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuthenticatedUser } from './auth.guard';

// Metadata keys from Better Auth (see @thallesp/nestjs-better-auth)
const ALLOW_ANONYMOUS_KEY = 'PUBLIC';
const OPTIONAL_AUTH_KEY = 'OPTIONAL';

/**
 * Global auth guard that checks both cookie session and API token authentication.
 *
 * This replaces Better Auth's global AuthGuard which only checks session.user.
 * It respects @AllowAnonymous() and @OptionalAuth() decorators from Better Auth.
 *
 * For cookie auth, it calls Better Auth's getSession() to populate request.session.
 * For API token auth, ApiTokenMiddleware already sets request.apiTokenUser.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly logger = new Logger(CombinedAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // If API token auth already set the user, skip session lookup
    if (!request.apiTokenUser) {
      // Call Better Auth's getSession to populate request.session
      // This is what Better Auth's global guard normally does
      const session = await this.authService.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      request.session = session;
      request.user = session?.user ?? null;
    }

    // Check for @AllowAnonymous() decorator
    const allowAnonymous = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANONYMOUS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowAnonymous) {
      return true;
    }

    // Check for @OptionalAuth() decorator
    const optionalAuth = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const user = getAuthenticatedUser(request);

    if (!user) {
      // If optional auth, allow request to proceed without user
      if (optionalAuth) {
        return true;
      }
      this.logger.debug(
        `Unauthorized request to ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}
