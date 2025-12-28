import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuthenticatedUser } from './auth.guard';

// Metadata keys from Better Auth (see @thallesp/nestjs-better-auth)
const ALLOW_ANONYMOUS_KEY = 'PUBLIC';
const OPTIONAL_AUTH_KEY = 'OPTIONAL';

/**
 * Global auth guard that checks both cookie session and API token authentication.
 *
 * This replaces Better Auth's global AuthGuard which only checks session.user.
 * It respects @AllowAnonymous() and @OptionalAuth() decorators from Better Auth.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly logger = new Logger(CombinedAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    this.logger.debug(
      `[Guard] ${request.method} ${request.url} - session.user: ${!!request.session?.user}, apiTokenUser: ${!!request.apiTokenUser}`,
    );

    // Check for @AllowAnonymous() decorator
    const allowAnonymous = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANONYMOUS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowAnonymous) {
      this.logger.debug(`[Guard] @AllowAnonymous - allowing`);
      return true;
    }

    // Check for @OptionalAuth() decorator
    const optionalAuth = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const user = getAuthenticatedUser(request);

    this.logger.debug(`[Guard] user found: ${!!user}, optionalAuth: ${!!optionalAuth}`);

    if (!user) {
      // If optional auth, allow request to proceed without user
      if (optionalAuth) {
        this.logger.debug(`[Guard] @OptionalAuth - allowing without user`);
        return true;
      }
      this.logger.debug(
        `[Guard] Unauthorized - no user found for ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException();
    }

    this.logger.debug(`[Guard] Authenticated as ${user.email}`);
    return true;
  }
}
