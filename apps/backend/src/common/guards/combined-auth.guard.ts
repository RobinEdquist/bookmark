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

    const request = context.switchToHttp().getRequest();
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
