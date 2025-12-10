import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { IncomingHttpHeaders } from 'http';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { apiKey } from '../auth/api-key.schema';
import * as authSchema from '../auth/schema';
import type {
  ApiKeyResponse,
  ApiKeyCreateResponse,
} from './dto/api-key-response.dto';

type Schema = typeof authSchema & { apiKey: typeof apiKey };

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  async getUserApiKey(userId: string): Promise<ApiKeyResponse | null> {
    const keys = await this.db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        start: apiKey.start,
        createdAt: apiKey.createdAt,
        lastRequest: apiKey.lastRequest,
        metadata: apiKey.metadata,
      })
      .from(apiKey)
      .where(and(eq(apiKey.userId, userId), eq(apiKey.enabled, true)))
      .limit(1);

    if (keys.length === 0) return null;

    const key = keys[0];
    let metadata: Record<string, unknown> = {};
    if (key.metadata) {
      try {
        const parsed = JSON.parse(key.metadata);
        if (parsed && typeof parsed === 'object') {
          metadata = parsed;
        }
      } catch {
        // Invalid JSON, use empty object
      }
    }

    return {
      id: key.id,
      name: key.name,
      start: key.start,
      createdAt: key.createdAt,
      lastRequest: key.lastRequest,
      lastIp: (metadata.lastIp as string) || null,
    };
  }

  async createApiKey(
    userId: string,
    authInstance: any,
  ): Promise<ApiKeyCreateResponse> {
    // Revoke any existing keys first
    await this.revokeAllUserKeys(userId);

    // Create new key via Better Auth
    const result = await authInstance.api.createApiKey({
      body: {
        name: 'OPDS Access Key',
        userId,
      },
    });

    return {
      id: result.id,
      name: result.name,
      key: result.key,
      start: result.start,
      createdAt: result.createdAt,
    };
  }

  async revokeApiKey(
    keyId: string,
    userId: string,
    authInstance: any,
    headers: IncomingHttpHeaders,
  ): Promise<{ success: boolean }> {
    // Verify key belongs to user first
    const keys = await this.db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, userId)))
      .limit(1);

    if (keys.length === 0) {
      throw new NotFoundException('API key not found');
    }

    // Use Better Auth API with the request headers for authentication
    await authInstance.api.deleteApiKey({
      body: { keyId },
      headers,
    });

    return { success: true };
  }

  /**
   * Admin-only: Revoke all API keys for a user.
   * Uses direct DB deletion since admin doesn't own the keys and
   * Better Auth's deleteApiKey requires the key owner's session.
   */
  async revokeUserApiKeyByUserId(
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.revokeAllUserKeys(userId);
    return { success: true };
  }

  private async revokeAllUserKeys(userId: string): Promise<void> {
    await this.db.delete(apiKey).where(eq(apiKey.userId, userId));
  }

  async updateKeyUsage(keyId: string, ip: string): Promise<void> {
    const metadata = JSON.stringify({ lastIp: ip });
    await this.db.update(apiKey).set({ metadata }).where(eq(apiKey.id, keyId));
  }
}
