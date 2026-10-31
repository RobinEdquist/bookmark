import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import type { AuthenticatedUser } from '../common/guards/auth.guard';
import * as authSchema from '../auth/schema';
import * as mcpSchema from './schema';
import type { ChangeEntry, EntityType } from './mcp-fields';

export type ChangeRow = typeof mcpSchema.mcpChangeLog.$inferSelect;

export interface ListChangesFilters {
  entityType?: EntityType;
  entityId?: string;
  userId?: string;
  changeSetId?: string;
  tool?: string;
  limit?: number;
  offset?: number;
  /** Full values instead of shortened text. */
  full?: boolean;
}

export const LIST_CHANGES_DEFAULT_LIMIT = 25;
/** Text longer than this is shortened in lists unless `full` is set. */
const SHORT_TEXT = 160;

/**
 * The MCP change log: every write a tool makes, one row per field, grouped
 * by the tool call that made it.
 */
@Injectable()
export class McpChangeLogService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof mcpSchema & typeof authSchema>,
  ) {}

  /**
   * Starts a change set for one tool call. Rows are written as the tool goes,
   * so a call that stops halfway still records what it changed.
   */
  open(user: AuthenticatedUser, tool: string): ChangeSetWriter {
    return new ChangeSetWriter(this.db, user, tool);
  }

  /**
   * Writes one tool call's changes as a change set. Returns its id, or null
   * if there was nothing to record.
   */
  async record(
    user: AuthenticatedUser,
    tool: string,
    entries: ChangeEntry[],
  ): Promise<string | null> {
    const changeSet = this.open(user, tool);
    await changeSet.add(entries);
    return changeSet.idIfWritten;
  }

  /** A change set's rows in the order they were written. */
  async changeSet(changeSetId: string): Promise<ChangeRow[]> {
    return this.db
      .select()
      .from(mcpSchema.mcpChangeLog)
      .where(eq(mcpSchema.mcpChangeLog.changeSetId, changeSetId))
      .orderBy(asc(mcpSchema.mcpChangeLog.position));
  }

  async markUndone(ids: string[], undoneBy: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(mcpSchema.mcpChangeLog)
      .set({ undoneAt: new Date(), undoneBy })
      .where(inArray(mcpSchema.mcpChangeLog.id, ids));
  }

  /** Newest first, paged. */
  async list(filters: ListChangesFilters): Promise<object> {
    const log = mcpSchema.mcpChangeLog;
    const conditions: SQL[] = [];
    if (filters.entityType)
      conditions.push(eq(log.entityType, filters.entityType));
    if (filters.entityId) conditions.push(eq(log.entityId, filters.entityId));
    if (filters.userId) conditions.push(eq(log.userId, filters.userId));
    if (filters.changeSetId) {
      conditions.push(eq(log.changeSetId, filters.changeSetId));
    }
    if (filters.tool) conditions.push(eq(log.tool, filters.tool));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit ?? LIST_CHANGES_DEFAULT_LIMIT;
    const offset = filters.offset ?? 0;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ row: log, userName: authSchema.user.name })
        .from(log)
        .leftJoin(authSchema.user, eq(log.userId, authSchema.user.id))
        .where(where)
        .orderBy(desc(log.createdAt), desc(log.position))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(log)
        .where(where),
    ]);

    const shown = (value: unknown) => (filters.full ? value : shorten(value));
    return {
      total,
      offset,
      items: rows.map(({ row, userName }) => ({
        at: row.createdAt.toISOString(),
        changeSetId: row.changeSetId,
        tool: row.tool,
        user: userName ?? null,
        entityType: row.entityType,
        id: row.entityId,
        field: row.field,
        before: shown(row.before),
        after: shown(row.after),
        ...(row.undoneBy ? { undoneBy: row.undoneBy } : {}),
      })),
    };
  }
}

/** Rows of one change set, numbered in the order they are added. */
export class ChangeSetWriter {
  readonly id = randomUUID();
  private written = 0;

  constructor(
    private readonly db: NodePgDatabase<typeof mcpSchema>,
    private readonly user: AuthenticatedUser,
    private readonly tool: string,
  ) {}

  /** The id once anything is recorded, else null. */
  get idIfWritten(): string | null {
    return this.written > 0 ? this.id : null;
  }

  async add(entries: ChangeEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const start = this.written;
    await this.db.insert(mcpSchema.mcpChangeLog).values(
      entries.map((entry, index) => ({
        changeSetId: this.id,
        position: start + index,
        userId: this.user.id,
        tool: this.tool,
        entityType: entry.entityType,
        entityId: entry.entityId,
        field: entry.field,
        before: entry.before ?? null,
        after: entry.after ?? null,
      })),
    );
    this.written += entries.length;
  }
}

/** Long text cut to SHORT_TEXT characters, at any depth. */
export function shorten(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > SHORT_TEXT ? `${value.slice(0, SHORT_TEXT)}…` : value;
  }
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, shorten(inner)]),
    );
  }
  return value;
}

const partialLogger = new Logger('McpChangeLog');

/**
 * The error to report when a tool stops partway: what it applied stays
 * applied and is in the change set, and the agent needs to hear both.
 */
export function stoppedPartway(
  error: unknown,
  changeSet: ChangeSetWriter,
  done: number,
  total: number,
): unknown {
  if (!changeSet.idIfWritten) return error;
  const known = error instanceof HttpException;
  if (!known) partialLogger.error('MCP write stopped partway', error);
  return new HttpException(
    `Stopped after ${done} of ${total}: ${known ? error.message : 'the server failed'}. ` +
      `What was applied is in change set ${changeSet.id}.`,
    known ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
