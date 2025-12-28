import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
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
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = getAuthenticatedUser(request);

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}
