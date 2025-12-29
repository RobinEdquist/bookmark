import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as listsSchema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
import {
  CreateListDto,
  UpdateListDto,
  AddItemDto,
  ReorderItemsDto,
} from './dto';

type CombinedSchema = typeof listsSchema &
  typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof authSchema;

@Injectable()
export class ListsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
  ) {}

  /**
   * Get all lists for a user
   */
  async findAllForUser(userId: string) {
    const userLists = await this.db
      .select({
        id: listsSchema.lists.id,
        name: listsSchema.lists.name,
        isPublic: listsSchema.lists.isPublic,
        createdAt: listsSchema.lists.createdAt,
        updatedAt: listsSchema.lists.updatedAt,
        itemCount: sql<number>`(
          SELECT COUNT(*) FROM list_items WHERE list_id = ${listsSchema.lists.id}
        )::int`,
      })
      .from(listsSchema.lists)
      .where(eq(listsSchema.lists.userId, userId))
      .orderBy(desc(listsSchema.lists.updatedAt));

    return userLists;
  }

  /**
   * Get a single list by ID with items
   */
  async findById(listId: string, requestingUserId: string) {
    const listResult = await this.db
      .select()
      .from(listsSchema.lists)
      .where(eq(listsSchema.lists.id, listId))
      .limit(1);

    if (listResult.length === 0) {
      throw new NotFoundException('List not found');
    }

    const list = listResult[0];

    // Check access: owner or public
    if (list.userId !== requestingUserId && !list.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    // Fetch items with related audiobook/ebook data
    const items = await this.getListItemsWithDetails(listId);

    return {
      ...list,
      items,
      isOwner: list.userId === requestingUserId,
    };
  }

  /**
   * Get list items with audiobook/ebook details
   */
  private async getListItemsWithDetails(listId: string) {
    const items = await this.db
      .select({
        id: listsSchema.listItems.id,
        listId: listsSchema.listItems.listId,
        itemType: listsSchema.listItems.itemType,
        audiobookId: listsSchema.listItems.audiobookId,
        ebookId: listsSchema.listItems.ebookId,
        order: listsSchema.listItems.order,
        createdAt: listsSchema.listItems.createdAt,
      })
      .from(listsSchema.listItems)
      .where(eq(listsSchema.listItems.listId, listId))
      .orderBy(asc(listsSchema.listItems.order));

    // Fetch audiobook and ebook details for each item
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        if (item.itemType === 'audiobook' && item.audiobookId) {
          const audiobook = await this.getAudiobookSummary(item.audiobookId);
          return { ...item, audiobook, ebook: null };
        } else if (item.itemType === 'ebook' && item.ebookId) {
          const ebook = await this.getEbookSummary(item.ebookId);
          return { ...item, audiobook: null, ebook };
        }
        return { ...item, audiobook: null, ebook: null };
      }),
    );

    // Filter out items where the audiobook/ebook no longer exists
    return itemsWithDetails.filter(
      (item) => item.audiobook !== null || item.ebook !== null,
    );
  }

  private async getAudiobookSummary(audiobookId: string) {
    const result = await this.db
      .select({
        id: audiobooksSchema.audiobooks.id,
        title: audiobooksSchema.audiobooks.title,
        subtitle: audiobooksSchema.audiobooks.subtitle,
        coverUrl: audiobooksSchema.audiobooks.coverUrl,
        duration: audiobooksSchema.audiobooks.duration,
        status: audiobooksSchema.audiobooks.status,
      })
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, audiobookId))
      .limit(1);

    if (result.length === 0) return null;

    // Get authors
    const authors = await this.db
      .select({
        name: audiobooksSchema.people.name,
      })
      .from(audiobooksSchema.audiobookAuthors)
      .innerJoin(
        audiobooksSchema.people,
        eq(
          audiobooksSchema.audiobookAuthors.personId,
          audiobooksSchema.people.id,
        ),
      )
      .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId))
      .orderBy(asc(audiobooksSchema.audiobookAuthors.order));

    return {
      ...result[0],
      authors: authors.map((a) => a.name),
    };
  }

  private async getEbookSummary(ebookId: string) {
    const result = await this.db
      .select({
        id: ebooksSchema.ebooks.id,
        title: ebooksSchema.ebooks.title,
        subtitle: ebooksSchema.ebooks.subtitle,
        coverUrl: ebooksSchema.ebooks.coverUrl,
        pageCount: ebooksSchema.ebooks.pageCount,
        status: ebooksSchema.ebooks.status,
      })
      .from(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.id, ebookId))
      .limit(1);

    if (result.length === 0) return null;

    // Get authors
    const authors = await this.db
      .select({
        name: audiobooksSchema.people.name,
      })
      .from(ebooksSchema.ebookAuthors)
      .innerJoin(
        audiobooksSchema.people,
        eq(ebooksSchema.ebookAuthors.personId, audiobooksSchema.people.id),
      )
      .where(eq(ebooksSchema.ebookAuthors.ebookId, ebookId))
      .orderBy(asc(ebooksSchema.ebookAuthors.order));

    return {
      ...result[0],
      authors: authors.map((a) => a.name),
    };
  }

  /**
   * Create a new list
   */
  async create(userId: string, dto: CreateListDto) {
    const result = await this.db
      .insert(listsSchema.lists)
      .values({
        userId,
        name: dto.name,
        isPublic: dto.isPublic ?? false,
      })
      .returning();

    return result[0];
  }

  /**
   * Update a list
   */
  async update(listId: string, userId: string, dto: UpdateListDto) {
    await this.verifyOwnership(listId, userId);

    const result = await this.db
      .update(listsSchema.lists)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      })
      .where(eq(listsSchema.lists.id, listId))
      .returning();

    return result[0];
  }

  /**
   * Delete a list
   */
  async delete(listId: string, userId: string) {
    await this.verifyOwnership(listId, userId);

    await this.db
      .delete(listsSchema.lists)
      .where(eq(listsSchema.lists.id, listId));
  }

  /**
   * Add an item to a list
   */
  async addItem(listId: string, userId: string, dto: AddItemDto) {
    await this.verifyOwnership(listId, userId);

    // Verify item exists
    if (dto.itemType === 'audiobook') {
      const audiobook = await this.db
        .select({ id: audiobooksSchema.audiobooks.id })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, dto.itemId))
        .limit(1);
      if (audiobook.length === 0) {
        throw new NotFoundException('Audiobook not found');
      }
    } else {
      const ebook = await this.db
        .select({ id: ebooksSchema.ebooks.id })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.id, dto.itemId))
        .limit(1);
      if (ebook.length === 0) {
        throw new NotFoundException('Ebook not found');
      }
    }

    // Check if item is already in list
    const existingItem = await this.db
      .select({ id: listsSchema.listItems.id })
      .from(listsSchema.listItems)
      .where(
        and(
          eq(listsSchema.listItems.listId, listId),
          dto.itemType === 'audiobook'
            ? eq(listsSchema.listItems.audiobookId, dto.itemId)
            : eq(listsSchema.listItems.ebookId, dto.itemId),
        ),
      )
      .limit(1);

    if (existingItem.length > 0) {
      throw new ConflictException('Item is already in this list');
    }

    // Get max order for this list
    const maxOrderResult = await this.db
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${listsSchema.listItems.order}), -1)`,
      })
      .from(listsSchema.listItems)
      .where(eq(listsSchema.listItems.listId, listId));

    const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

    // Insert item
    const result = await this.db
      .insert(listsSchema.listItems)
      .values({
        listId,
        itemType: dto.itemType,
        audiobookId: dto.itemType === 'audiobook' ? dto.itemId : null,
        ebookId: dto.itemType === 'ebook' ? dto.itemId : null,
        order: nextOrder,
      })
      .returning();

    // Update list's updatedAt
    await this.db
      .update(listsSchema.lists)
      .set({ updatedAt: new Date() })
      .where(eq(listsSchema.lists.id, listId));

    return result[0];
  }

  /**
   * Remove an item from a list
   */
  async removeItem(listId: string, itemId: string, userId: string) {
    await this.verifyOwnership(listId, userId);

    const result = await this.db
      .delete(listsSchema.listItems)
      .where(
        and(
          eq(listsSchema.listItems.id, itemId),
          eq(listsSchema.listItems.listId, listId),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundException('Item not found in list');
    }

    // Update list's updatedAt
    await this.db
      .update(listsSchema.lists)
      .set({ updatedAt: new Date() })
      .where(eq(listsSchema.lists.id, listId));

    return result[0];
  }

  /**
   * Reorder items in a list
   */
  async reorderItems(listId: string, userId: string, dto: ReorderItemsDto) {
    await this.verifyOwnership(listId, userId);

    // Update order for each item in a transaction
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < dto.itemIds.length; i++) {
        await tx
          .update(listsSchema.listItems)
          .set({ order: i })
          .where(
            and(
              eq(listsSchema.listItems.id, dto.itemIds[i]),
              eq(listsSchema.listItems.listId, listId),
            ),
          );
      }
    });

    // Update list's updatedAt
    await this.db
      .update(listsSchema.lists)
      .set({ updatedAt: new Date() })
      .where(eq(listsSchema.lists.id, listId));
  }

  /**
   * Get user's lists with containsItem flag for a specific item
   */
  async getListsForItem(
    userId: string,
    itemType: 'audiobook' | 'ebook',
    itemId: string,
  ) {
    const userLists = await this.db
      .select({
        id: listsSchema.lists.id,
        name: listsSchema.lists.name,
        isPublic: listsSchema.lists.isPublic,
        itemCount: sql<number>`(
          SELECT COUNT(*) FROM list_items WHERE list_id = ${listsSchema.lists.id}
        )::int`,
        containsItem: sql<boolean>`EXISTS (
          SELECT 1 FROM list_items
          WHERE list_id = ${listsSchema.lists.id}
          AND ${itemType === 'audiobook' ? sql`audiobook_id = ${itemId}` : sql`ebook_id = ${itemId}`}
        )`,
        listItemId: sql<string | null>`(
          SELECT id FROM list_items
          WHERE list_id = ${listsSchema.lists.id}
          AND ${itemType === 'audiobook' ? sql`audiobook_id = ${itemId}` : sql`ebook_id = ${itemId}`}
          LIMIT 1
        )`,
      })
      .from(listsSchema.lists)
      .where(eq(listsSchema.lists.userId, userId))
      .orderBy(asc(listsSchema.lists.name));

    return userLists;
  }

  /**
   * Verify that a user owns a list
   */
  private async verifyOwnership(listId: string, userId: string) {
    const list = await this.db
      .select({ userId: listsSchema.lists.userId })
      .from(listsSchema.lists)
      .where(eq(listsSchema.lists.id, listId))
      .limit(1);

    if (list.length === 0) {
      throw new NotFoundException('List not found');
    }

    if (list[0].userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this list');
    }
  }
}
