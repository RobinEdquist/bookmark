// apps/backend/src/mcp/schema.ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { user } from '../auth/schema';

/**
 * Every write made through the MCP server, one row per changed field.
 *
 * `changeSetId` groups the rows written by one tool call, which is also the
 * unit `undo_change` works on. `before` and `after` hold the stored value and,
 * for lockable fields, whether the field was locked (see McpChangeValue).
 * Rows are never updated except to mark them undone.
 */
export const mcpChangeLog = pgTable(
  'mcp_change_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    changeSetId: uuid('change_set_id').notNull(),
    // Order within the change set; undo replays the set backwards.
    position: integer('position').notNull().default(0),
    // Kept when the user is deleted, so the history stays readable.
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    tool: text('tool').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    field: text('field').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Set when undo_change reverted this row; the id is the undo's change set.
    undoneAt: timestamp('undone_at'),
    undoneBy: uuid('undone_by'),
  },
  (table) => [
    index('mcp_change_log_change_set_id_idx').on(table.changeSetId),
    index('mcp_change_log_entity_idx').on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index('mcp_change_log_user_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
    index('mcp_change_log_created_at_idx').on(table.createdAt),
  ],
);
