// apps/backend/src/import-errors/import-errors.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql, desc, and } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';

export interface ImportErrorFilters {
  status?: 'pending' | 'retrying' | 'resolved' | 'ignored';
  limit?: number;
  offset?: number;
}

@Injectable()
export class ImportErrorsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async recordError(
    filePath: string,
    error: Error,
    errorCode?: string,
  ): Promise<void> {
    const existing = await this.db
      .select()
      .from(schema.importErrors)
      .where(eq(schema.importErrors.filePath, filePath))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(schema.importErrors)
        .set({
          errorMessage: error.message,
          errorCode,
          errorDetails: { stack: error.stack },
          lastOccurredAt: new Date(),
          attemptCount: sql`${schema.importErrors.attemptCount} + 1`,
          status: 'pending',
        })
        .where(eq(schema.importErrors.id, existing[0].id));
    } else {
      await this.db.insert(schema.importErrors).values({
        filePath,
        errorMessage: error.message,
        errorCode,
        errorDetails: { stack: error.stack },
      });
    }
  }

  async getErrors(filters: ImportErrorFilters = {}) {
    const { status, limit = 50, offset = 0 } = filters;

    const conditions = status
      ? eq(schema.importErrors.status, status)
      : undefined;

    const errors = await this.db
      .select()
      .from(schema.importErrors)
      .where(conditions)
      .orderBy(desc(schema.importErrors.lastOccurredAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.importErrors)
      .where(conditions);

    return {
      errors,
      total: countResult.count,
    };
  }

  async getError(id: string) {
    const [error] = await this.db
      .select()
      .from(schema.importErrors)
      .where(eq(schema.importErrors.id, id))
      .limit(1);
    return error || null;
  }

  async markRetrying(id: string): Promise<void> {
    await this.db
      .update(schema.importErrors)
      .set({ status: 'retrying' })
      .where(eq(schema.importErrors.id, id));
  }

  async markResolved(id: string): Promise<void> {
    await this.db
      .update(schema.importErrors)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
      })
      .where(eq(schema.importErrors.id, id));
  }

  async markIgnored(id: string, userId: string): Promise<void> {
    await this.db
      .update(schema.importErrors)
      .set({
        status: 'ignored',
        ignoredAt: new Date(),
        ignoredBy: userId,
      })
      .where(eq(schema.importErrors.id, id));
  }

  async deleteError(id: string): Promise<void> {
    await this.db
      .delete(schema.importErrors)
      .where(eq(schema.importErrors.id, id));
  }

  async isQuarantined(filePath: string): Promise<boolean> {
    const [error] = await this.db
      .select({ id: schema.importErrors.id })
      .from(schema.importErrors)
      .where(
        and(
          eq(schema.importErrors.filePath, filePath),
          eq(schema.importErrors.status, 'ignored'),
        ),
      )
      .limit(1);
    return !!error;
  }

  async clearResolvedByPath(filePath: string): Promise<void> {
    await this.db
      .delete(schema.importErrors)
      .where(
        and(
          eq(schema.importErrors.filePath, filePath),
          eq(schema.importErrors.status, 'resolved'),
        ),
      );
  }
}
