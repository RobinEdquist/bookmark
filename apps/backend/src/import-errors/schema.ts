// apps/backend/src/import-errors/schema.ts
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { user } from '../auth/schema';

export const importErrorStatusEnum = pgEnum('import_error_status', [
  'pending',
  'retrying',
  'resolved',
  'ignored',
]);

export const importErrors = pgTable(
  'import_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filePath: text('file_path').notNull(),
    errorMessage: text('error_message').notNull(),
    errorCode: text('error_code'),
    errorDetails: jsonb('error_details').$type<{ stack?: string; context?: Record<string, unknown> }>(),
    status: importErrorStatusEnum('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(1),
    firstOccurredAt: timestamp('first_occurred_at').defaultNow().notNull(),
    lastOccurredAt: timestamp('last_occurred_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
    ignoredAt: timestamp('ignored_at'),
    ignoredBy: text('ignored_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('import_errors_status_idx').on(table.status),
    index('import_errors_file_path_idx').on(table.filePath),
  ],
);
