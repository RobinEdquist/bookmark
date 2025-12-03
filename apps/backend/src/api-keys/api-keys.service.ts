import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
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
    const metadata = key.metadata ? JSON.parse(key.metadata) : {};

    return {
      id: key.id,
      name: key.name,
      start: key.start,
      createdAt: key.createdAt,
      lastRequest: key.lastRequest,
      lastIp: metadata.lastIp || null,
    };
  }

  async createApiKey(
    userId: string,
    authInstance: any,
  ): Promise<ApiKeyCreateResponse> {
    // Revoke any existing keys first
    await this.revokeAllUserKeys(userId, authInstance);

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
  ): Promise<{ success: boolean }> {
    // Verify key belongs to user
    const keys = await this.db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, userId)))
      .limit(1);

    if (keys.length === 0) {
      throw new NotFoundException('API key not found');
    }

    await authInstance.api.deleteApiKey({ body: { keyId } });
    return { success: true };
  }

  async revokeUserApiKeyByUserId(
    userId: string,
    authInstance: any,
  ): Promise<{ success: boolean }> {
    await this.revokeAllUserKeys(userId, authInstance);
    return { success: true };
  }

  private async revokeAllUserKeys(
    userId: string,
    authInstance: any,
  ): Promise<void> {
    const existingKeys = await this.db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(eq(apiKey.userId, userId));

    for (const key of existingKeys) {
      await authInstance.api.deleteApiKey({ body: { keyId: key.id } });
    }
  }

  async updateKeyUsage(keyId: string, ip: string): Promise<void> {
    const metadata = JSON.stringify({ lastIp: ip });
    await this.db.update(apiKey).set({ metadata }).where(eq(apiKey.id, keyId));
  }
}
