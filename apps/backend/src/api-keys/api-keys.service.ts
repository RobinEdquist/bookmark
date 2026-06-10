import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { apiKey } from '../auth/api-key.schema';
import { parseLastIp } from './api-key-metadata.util';
import * as authSchema from '../auth/schema';
import type {
  ApiKeyResponse,
  ApiKeyCreateResponse,
} from './dto/api-key-response.dto';

type Schema = typeof authSchema & { apiKey: typeof apiKey };

export const MAX_API_KEYS_PER_USER = 10;

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Schema>,
  ) {}

  async getUserApiKeys(userId: string): Promise<ApiKeyResponse[]> {
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
      .orderBy(desc(apiKey.createdAt));

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      start: key.start,
      createdAt: key.createdAt,
      lastRequest: key.lastRequest,
      lastIp: parseLastIp(key.metadata),
    }));
  }

  async createApiKey(
    userId: string,
    authInstance: any,
    name?: string,
  ): Promise<ApiKeyCreateResponse> {
    const existing = await this.db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.userId, userId), eq(apiKey.enabled, true)));

    if (existing.length >= MAX_API_KEYS_PER_USER) {
      throw new ConflictException(
        `Maximum of ${MAX_API_KEYS_PER_USER} API keys reached`,
      );
    }

    const keyName =
      name?.trim() || `API Key ${new Date().toISOString().slice(0, 10)}`;

    // Create new key via Better Auth
    const result = await authInstance.api.createApiKey({
      body: {
        name: keyName,
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
  ): Promise<{ success: boolean }> {
    // Direct DB delete scoped to (keyId, userId). We can't go through
    // Better Auth's deleteApiKey here because that endpoint requires the
    // owner's session cookie, but this route is reachable via API-key auth
    // (e.g. mobile sign-out). The (id, userId) predicate is the same
    // ownership check Better Auth would enforce, so this stays safe.
    const result = await this.db
      .delete(apiKey)
      .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, userId)))
      .returning({ id: apiKey.id });

    if (result.length === 0) {
      throw new NotFoundException('API key not found');
    }

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
