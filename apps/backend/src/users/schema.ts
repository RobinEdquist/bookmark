import { pgTable, text, boolean, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { tags } from '../audiobooks/schema';

export const userPermissions = pgTable('user_permissions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  canEditMetadata: boolean('can_edit_metadata').notNull().default(false),
  canUploadAudiobooks: boolean('can_upload_audiobooks').notNull().default(false),
  canDeleteAudiobooks: boolean('can_delete_audiobooks').notNull().default(false),
  canGenerateApiKeys: boolean('can_generate_api_keys').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const userBlacklistedTags = pgTable(
  'user_blacklisted_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_blacklisted_tags_user_id_idx').on(table.userId),
    index('user_blacklisted_tags_tag_id_idx').on(table.tagId),
  ],
);

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(user, {
    fields: [userPermissions.userId],
    references: [user.id],
  }),
}));

export const userBlacklistedTagsRelations = relations(userBlacklistedTags, ({ one }) => ({
  user: one(user, {
    fields: [userBlacklistedTags.userId],
    references: [user.id],
  }),
  tag: one(tags, {
    fields: [userBlacklistedTags.tagId],
    references: [tags.id],
  }),
}));
