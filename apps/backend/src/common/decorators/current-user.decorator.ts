import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from '../guards/auth.guard';

/**
 * Parameter decorator that extracts the current authenticated user from the request.
 *
 * Works with both:
 * - Cookie session authentication (Better Auth's request.session.user)
 * - API token authentication (ApiTokenMiddleware's request.apiTokenUser)
 *
 * @example
 * ```typescript
 * @Get('me')
 * async getProfile(@CurrentUser() user: AuthenticatedUser) {
 *   return user;
 * }
 * ```
 *
 * @throws UnauthorizedException if no authenticated user is found
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    const user = getAuthenticatedUser(request);

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return user;
  },
);

/**
 * Optional version that returns null instead of throwing if not authenticated.
 *
 * @example
 * ```typescript
 * @Get('public')
 * async getData(@CurrentUserOptional() user: AuthenticatedUser | null) {
 *   if (user) {
 *     // Show personalized data
 *   }
 * }
 * ```
 */
export const CurrentUserOptional = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser | null => {
    const request = ctx.switchToHttp().getRequest();
    return getAuthenticatedUser(request);
  },
);
