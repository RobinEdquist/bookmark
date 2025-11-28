import { Injectable, Inject } from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../app-settings/schema';
import { eq } from 'drizzle-orm';

const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
const HARDCOVER_TIMEOUT = 30000;

@Injectable()
export class HardcoverService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  private createClient(apiKey: string): GraphQLClient {
    return new GraphQLClient(HARDCOVER_API_URL, {
      headers: {
        authorization: apiKey,
      },
      timeout: HARDCOVER_TIMEOUT,
    });
  }

  async getApiKey(): Promise<string | null> {
    const settings = await this.db
      .select({ hardcoverApiKey: schema.appSettings.hardcoverApiKey })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.id, 'app_settings'))
      .limit(1);

    return settings[0]?.hardcoverApiKey ?? null;
  }

  async setApiKey(apiKey: string | null): Promise<void> {
    await this.db
      .update(schema.appSettings)
      .set({ hardcoverApiKey: apiKey })
      .where(eq(schema.appSettings.id, 'app_settings'));
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    const client = this.createClient(apiKey);

    const query = `
      query {
        me {
          id
          username
        }
      }
    `;

    try {
      await client.request(query);
      return { valid: true };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          return { valid: false, error: 'Invalid or expired API key' };
        }
        if (error.message.includes('429')) {
          return { valid: false, error: 'Rate limit exceeded, try again in a minute' };
        }
        return { valid: false, error: error.message };
      }
      return { valid: false, error: 'Failed to connect to Hardcover' };
    }
  }

  async searchBooks(query: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      return { success: false, error: 'Hardcover API key not configured' };
    }

    const client = this.createClient(apiKey);

    const graphqlQuery = `
      query SearchBooks($query: String!) {
        search(
          query: $query,
          query_type: "books",
          per_page: 10,
          page: 1
        ) {
          results
        }
      }
    `;

    try {
      const data = await client.request(graphqlQuery, { query });
      return { success: true, data };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          return { success: false, error: 'Invalid or expired API key' };
        }
        if (error.message.includes('429')) {
          return { success: false, error: 'Rate limit exceeded, try again in a minute' };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Failed to connect to Hardcover' };
    }
  }
}
