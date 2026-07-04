import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './schema';

export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    // better-auth 1.6+ scopes keys to a plugin configuration; single-config
    // setups (ours) always use 'default'.
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    prefix: text('prefix'),
    key: text('key').notNull(),
    // better-auth 1.6 calls this field `referenceId`; the plugin options map
    // it onto this property (see auth.provider.ts) so the column stays user_id.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    remaining: integer('remaining'),
    refillAmount: integer('refill_amount'),
    refillInterval: integer('refill_interval'),
    lastRefillAt: timestamp('last_refill_at'),
    enabled: boolean('enabled').default(true).notNull(),
    rateLimitEnabled: boolean('rate_limit_enabled'),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count'),
    lastRequest: timestamp('last_request'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => [
    index('api_key_v2_user_id_idx').on(table.userId),
    // The plugin looks keys up by key (every API request) and config_id.
    index('api_key_v2_key_idx').on(table.key),
    index('api_key_v2_config_id_idx').on(table.configId),
  ],
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, {
    fields: [apiKey.userId],
    references: [user.id],
  }),
}));
