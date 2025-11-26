import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../auth/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async updateLanguage(userId: string, language: string): Promise<void> {
    await this.db
      .update(schema.user)
      .set({ language })
      .where(eq(schema.user.id, userId));
  }

  async getLanguage(userId: string): Promise<string> {
    const result = await this.db
      .select({ language: schema.user.language })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    return result[0]?.language ?? 'en';
  }
}
