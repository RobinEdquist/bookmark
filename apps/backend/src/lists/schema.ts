import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from '../auth/schema';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';
import { comicSeries } from '../comics/schema';

// Lists table
export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('lists_user_id_idx').on(table.userId),
    index('lists_is_public_idx').on(table.isPublic),
  ],
);

// List items table - stores both audiobooks and ebooks
export const listItems = pgTable(
  'list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    itemType: text('item_type')
      .$type<'audiobook' | 'ebook' | 'comic_series'>()
      .notNull(),
    audiobookId: uuid('audiobook_id').references(() => audiobooks.id, {
      onDelete: 'cascade',
    }),
    ebookId: uuid('ebook_id').references(() => ebooks.id, {
      onDelete: 'cascade',
    }),
    comicSeriesId: uuid('comic_series_id').references(() => comicSeries.id, {
      onDelete: 'cascade',
    }),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('list_items_list_id_idx').on(table.listId),
    index('list_items_audiobook_id_idx').on(table.audiobookId),
    index('list_items_ebook_id_idx').on(table.ebookId),
    index('list_items_comic_series_id_idx').on(table.comicSeriesId),
    index('list_items_list_order_idx').on(table.listId, table.order),
  ],
);

// Relations
export const listsRelations = relations(lists, ({ one, many }) => ({
  user: one(user, {
    fields: [lists.userId],
    references: [user.id],
  }),
  items: many(listItems),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, {
    fields: [listItems.listId],
    references: [lists.id],
  }),
  audiobook: one(audiobooks, {
    fields: [listItems.audiobookId],
    references: [audiobooks.id],
  }),
  ebook: one(ebooks, {
    fields: [listItems.ebookId],
    references: [ebooks.id],
  }),
  comicSeries: one(comicSeries, {
    fields: [listItems.comicSeriesId],
    references: [comicSeries.id],
  }),
}));
