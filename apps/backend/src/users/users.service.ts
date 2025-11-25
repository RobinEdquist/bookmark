import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { user } from '../auth/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: any,
  ) {}

  async updateLanguage(userId: string, language: string): Promise<void> {
    await this.db
      .update(user)
      .set({ language })
      .where(eq(user.id, userId));
  }

  async getLanguage(userId: string): Promise<string> {
    const result = await this.db
      .select({ language: user.language })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return result[0]?.language ?? 'en';
  }
}
