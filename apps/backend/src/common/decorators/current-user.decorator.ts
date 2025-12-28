import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from '../guards/auth.guard';

const logger = new Logger('CurrentUser');

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
    logger.debug(
      `@CurrentUser decorator called for ${request.method} ${request.url}`,
    );
    logger.debug(
      `session.user: ${!!request.session?.user}, apiTokenUser: ${!!request.apiTokenUser}`,
    );

    const user = getAuthenticatedUser(request);

    if (!user) {
      logger.debug('No authenticated user found, throwing UnauthorizedException');
      throw new UnauthorizedException('Authentication required');
    }

    logger.debug(`Returning user: ${user.id}`);
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
