import { pgTable, text, timestamp, boolean, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appSettings = pgTable(
  'app_settings',
  {
    id: text('id').primaryKey().default('app_settings'),
    signupsEnabled: boolean('signups_enabled').notNull().default(true),
    libraryPath: text('library_path'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [check('single_row', sql`${table.id} = 'app_settings'`)],
);
