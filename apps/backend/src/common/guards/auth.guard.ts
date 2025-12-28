import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Represents an authenticated user from either cookie session or API token.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extended request type with authentication properties.
 */
interface AuthenticatedRequest extends Request {
  session?: { user?: AuthenticatedUser };
  apiTokenUser?: AuthenticatedUser;
}

/**
 * Helper to get authenticated user from request.
 * Checks both cookie session (from Better Auth) and API token user (from ApiTokenMiddleware).
 */
export function getAuthenticatedUser(
  request: AuthenticatedRequest,
): AuthenticatedUser | null {
  // Check cookie session first
  if (request.session?.user) {
    return request.session.user;
  }
  // Fall back to API token user
  if (request.apiTokenUser) {
    return request.apiTokenUser;
  }
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(
      `[AuthGuard] ${request.method} ${request.url} - session.user: ${!!request.session?.user}, apiTokenUser: ${!!request.apiTokenUser}`,
    );
    const user = getAuthenticatedUser(request);

    if (!user) {
      this.logger.debug(`[AuthGuard] No user found, throwing 401`);
      throw new UnauthorizedException('Authentication required');
    }

    this.logger.debug(`[AuthGuard] User found: ${user.email}`);
    return true;
  }
}
