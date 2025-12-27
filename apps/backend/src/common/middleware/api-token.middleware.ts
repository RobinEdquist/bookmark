import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
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
 * Supports two token formats:
 * 1. Bearer token: `Authorization: Bearer bkmrk_xxx`
 * 2. Basic Auth: `Authorization: Basic base64(any:bkmrk_xxx)`
 *
 * When a valid API token is found, this middleware populates `request.session`
 * with user data, making all existing guards work transparently.
 */
@Injectable()
export class ApiTokenMiddleware implements NestMiddleware {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
    private readonly authService: AuthService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Skip if already has session (cookie auth takes precedence)
    if ((req as any).session?.user) {
      return next();
    }

    // Extract API token from Authorization header
    const apiToken = this.extractApiToken(req.headers.authorization);
    if (!apiToken) {
      return next();
    }

    try {
      // Validate using Better Auth
      const authInstance = this.authService.instance as any;
      const result = await authInstance.api.verifyApiKey({
        body: { key: apiToken },
      });

      if (!result.valid || !result.key) {
        return next(); // Let guards handle unauthorized
      }

      // Look up user from database
      const users = await this.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.id, result.key.userId))
        .limit(1);

      if (users.length === 0) {
        return next(); // User not found, let guards handle it
      }

      const user = users[0];

      // Check if user is banned
      if (user.banned) {
        return next(); // Banned users should be rejected by guards
      }

      // Populate request.session to match cookie auth structure
      (req as any).session = {
        user: {
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
        },
      };

      // Track usage with IP address
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        'unknown';
      await this.apiKeysService.updateKeyUsage(result.key.id, clientIp);

      next();
    } catch {
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
}
