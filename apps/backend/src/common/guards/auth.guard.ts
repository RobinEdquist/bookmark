import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Helper to get authenticated user from request.
 * Checks both cookie session (from Better Auth) and API token user (from ApiTokenMiddleware).
 */
export function getAuthenticatedUser(request: any): any | null {
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
