import { Injectable, NestMiddleware, Inject, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database-connection.constants';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import * as authSchema from '../../auth/schema';

type Schema = typeof authSchema;

/**
 * Middleware that enables API token authentication for all endpoints.
 *
 * Supports three token formats:
 * 1. Bearer token: `Authorization: Bearer bkmrk_xxx`
 * 2. Basic Auth: `Authorization: Basic base64(any:bkmrk_xxx)`
 * 3. Query parameter: `?token=bkmrk_xxx`
 *
 * When a valid API token is found, this middleware populates `request.apiTokenUser`
 * with user data. Guards use `getAuthenticatedUser()` to check both session and
 * apiTokenUser, making API token authentication work transparently.
 *
 * Debug logging is available when log level is set to 'debug'.
 */
@Injectable()
export class ApiTokenMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiTokenMiddleware.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
    private readonly authService: AuthService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    this.logger.debug(`[1] Middleware called for ${req.method} ${req.path}`);
    this.logger.debug(
      `[2] Authorization header: ${req.headers.authorization?.substring(0, 30)}...`,
    );

    // Skip if already has session (cookie auth takes precedence)
    if ((req as any).session?.user) {
      this.logger.debug('[3] Skipping - session already exists');
      return next();
    }

    // Extract API token from Authorization header or query parameter
    const apiToken =
      this.extractApiToken(req.headers.authorization) ||
      this.extractApiTokenFromQuery(req.query.token);
    if (!apiToken) {
      this.logger.debug('[4] No API token found in header or query');
      return next();
    }

    this.logger.debug(`[5] Extracted token: ${apiToken.substring(0, 15)}...`);

    try {
      // Validate using Better Auth
      const authInstance = this.authService.instance as any;
      this.logger.debug('[6] Calling verifyApiKey...');
      const result = await authInstance.api.verifyApiKey({
        body: { key: apiToken },
      });

      this.logger.debug(
        `[7] verifyApiKey result: valid=${result.valid}, hasKey=${!!result.key}`,
      );

      if (!result.valid || !result.key) {
        this.logger.debug('[8] Token invalid or no key returned');
        return next(); // Let guards handle unauthorized
      }

      this.logger.debug(`[9] Looking up user: ${result.key.userId}`);

      // Look up user from database
      const users = await this.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, result.key.userId))
        .limit(1);

      if (users.length === 0) {
        this.logger.debug('[10] User not found in database');
        return next(); // User not found, let guards handle it
      }

      const user = users[0];

      this.logger.debug(`[11] Found user: ${user.email}, banned=${user.banned}`);

      // Check if user is banned (and ban hasn't expired)
      if (user.banned) {
        const banExpired =
          user.banExpires && new Date(user.banExpires) < new Date();
        if (!banExpired) {
          this.logger.debug('[12] User is banned');
          return next(); // Banned users should be rejected by guards
        }
        // Ban has expired, allow access
      }

      // Store API token user in a dedicated property that won't be overwritten
      // by Better Auth's session middleware (which sets request.session = null for non-cookie auth)
      const apiTokenUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      (req as any).apiTokenUser = apiTokenUser;

      this.logger.debug(`[13] apiTokenUser set for user: ${user.id}`);

      // Track usage with IP address
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        'unknown';
      await this.apiKeysService.updateKeyUsage(result.key.id, clientIp);

      this.logger.debug('[14] Usage tracked, calling next()');

      next();
    } catch (error) {
      // Always log errors for security monitoring
      this.logger.error('API token validation failed:', error);
      // If validation fails, let guards handle unauthorized
      next();
    }
  }

  /**
   * Extracts API token from Authorization header.
   * Supports both Bearer token and Basic Auth formats.
   */
  private extractApiToken(authHeader?: string): string | null {
    if (!authHeader) return null;

    // Format 1: Bearer token - "Authorization: Bearer bkmrk_xxx"
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7); // Remove "Bearer "
      if (token.startsWith('bkmrk_')) {
        return token;
      }
    }

    // Format 2: Basic Auth - "Authorization: Basic base64(any:bkmrk_xxx)"
    if (authHeader.startsWith('Basic ')) {
      try {
        const base64 = authHeader.slice(6);
        const decoded = Buffer.from(base64, 'base64').toString('utf-8');
        const [, password] = decoded.split(':');
        if (password?.startsWith('bkmrk_')) {
          return password;
        }
      } catch {
        // Invalid base64, ignore
      }
    }

    return null;
  }

  /**
   * Extracts API token from query parameter.
   * Format: ?token=bkmrk_xxx
   */
  private extractApiTokenFromQuery(token: unknown): string | null {
    // Handle array case (multiple query params with same name)
    const tokenValue = Array.isArray(token) ? token[0] : token;
    if (typeof tokenValue === 'string' && tokenValue.startsWith('bkmrk_')) {
      return tokenValue;
    }
    return null;
  }
}
