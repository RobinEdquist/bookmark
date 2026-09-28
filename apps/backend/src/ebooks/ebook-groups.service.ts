import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import type { CoverOperationConfig } from '../common/cover.service';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import { AppDataService } from '../app-data/app-data.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import * as schema from './schema';
import * as usersSchema from '../users/schema';
import {
  containsPattern,
  MemberOrderError,
  mergeMemberOrder,
  normalizeName,
  normalizeOptionalText,
  normalizeRole,
  resolveGroupCover,
} from './ebook-groups.helpers';
import type {
  EbookDetailGroupDto,
  EbookGroupDetailDto,
  EbookGroupIdResponseDto,
  EbookGroupListResponseDto,
  EbookGroupMemberDto,
  EbookGroupSuccessResponseDto,
} from './dto/ebook-group-response.dto';

type Db = NodePgDatabase<typeof schema & typeof usersSchema>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

interface ListGroupsFilters {
  search?: string;
  sortBy?: 'name' | 'recentlyAdded';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface MemberRow {
  groupId: string;
  id: string;
  title: string;
  coverUrl: string | null;
  coverSource: 'embedded' | 'uploaded' | 'folder_image' | null;
  status: string;
  role: string | null;
  position: number;
}

@Injectable()
export class EbookGroupsService {
  private readonly logger = new Logger(EbookGroupsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private db: Db,
    private coverService: CoverService,
    private metadataResolver: MetadataResolverService,
    private appData: AppDataService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  /**
   * Ebooks carrying a tag this user has blacklisted. Same rule as the ebook
   * list and the OPDS catalog.
   */
  private visibleToUser(userId: string): SQL {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${schema.ebookTags} et
      INNER JOIN ${usersSchema.userBlacklistedTags} bt
        ON et.tag_id = bt.tag_id AND bt.user_id = ${userId}
      WHERE et.ebook_id = ${schema.ebooks.id}
    )`;
  }

  async findAll(
    filters: ListGroupsFilters,
    userId: string,
  ): Promise<EbookGroupListResponseDto> {
    const { search, sortBy = 'name', limit = 50, offset = 0 } = filters;
    // "Recently added" means newest first unless the caller says otherwise.
    const sortOrder =
      filters.sortOrder ?? (sortBy === 'recentlyAdded' ? 'desc' : 'asc');
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const boundedOffset = Math.max(offset, 0);

    const pattern = search ? containsPattern(search) : null;
    const where = pattern
      ? or(
          ilike(schema.ebookGroups.name, pattern),
          ilike(schema.ebookGroups.sortName, pattern),
        )
      : undefined;

    const nameSort = sql`coalesce(${schema.ebookGroups.sortName}, ${schema.ebookGroups.name})`;
    const orderBy =
      sortBy === 'recentlyAdded'
        ? sortOrder === 'asc'
          ? asc(schema.ebookGroups.createdAt)
          : desc(schema.ebookGroups.createdAt)
        : sortOrder === 'desc'
          ? desc(nameSort)
          : asc(nameSort);

    const ebookCount = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.ebookGroupMembers)
      .innerJoin(
        schema.ebooks,
        eq(schema.ebookGroupMembers.ebookId, schema.ebooks.id),
      )
      .where(
        and(
          eq(schema.ebookGroupMembers.groupId, schema.ebookGroups.id),
          ne(schema.ebooks.status, 'hidden'),
          this.visibleToUser(userId),
        ),
      );

    const [items, [{ total }]] = await Promise.all([
      this.db
        .select({
          group: schema.ebookGroups,
          ebookCount: sql<number>`(${ebookCount})`,
        })
        .from(schema.ebookGroups)
        .where(where)
        .orderBy(orderBy, asc(schema.ebookGroups.id))
        .limit(boundedLimit)
        .offset(boundedOffset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(schema.ebookGroups)
        .where(where),
    ]);

    const firstCovers = await this.firstVisibleCovers(
      items.map(({ group }) => group.id),
      userId,
    );

    return {
      groups: items.map(({ group, ebookCount: count }) => ({
        id: group.id,
        name: group.name,
        ebookCount: Number(count),
        coverUrl: resolveGroupCover(
          this.ownCoverUrl(group.id, group.coverUrl, group.coverSource),
          firstCovers.get(group.id) ?? null,
        ),
        createdAt: group.createdAt,
      })),
      total: Number(total),
    };
  }

  async findOne(id: string, userId: string): Promise<EbookGroupDetailDto> {
    const group = await this.requireGroup(id);
    const members = await this.loadMembers([id], userId);
    const ebooks = members.get(id) ?? [];
    const ownCover = this.ownCoverUrl(
      group.id,
      group.coverUrl,
      group.coverSource,
    );

    return {
      id: group.id,
      name: group.name,
      sortName: group.sortName,
      description: group.description,
      coverUrl: resolveGroupCover(ownCover, ebooks[0]?.coverUrl ?? null),
      hasOwnCover: ownCover !== null,
      ebooks,
    };
  }

  /**
   * Groups this ebook belongs to, with the other visible members. Hidden
   * ebooks and ebooks blocked by the reader's tag blacklist are left out.
   */
  async findForEbook(
    ebookId: string,
    userId: string,
  ): Promise<EbookDetailGroupDto[]> {
    const memberships = await this.db
      .select({
        id: schema.ebookGroups.id,
        name: schema.ebookGroups.name,
        role: schema.ebookGroupMembers.role,
      })
      .from(schema.ebookGroupMembers)
      .innerJoin(
        schema.ebookGroups,
        eq(schema.ebookGroupMembers.groupId, schema.ebookGroups.id),
      )
      .where(eq(schema.ebookGroupMembers.ebookId, ebookId))
      .orderBy(asc(schema.ebookGroups.name), asc(schema.ebookGroups.id));

    if (memberships.length === 0) return [];

    const members = await this.loadMembers(
      memberships.map((membership) => membership.id),
      userId,
      ebookId,
    );

    return memberships.map((membership) => ({
      id: membership.id,
      name: membership.name,
      role: membership.role,
      members: members.get(membership.id) ?? [],
    }));
  }

  async create(input: {
    name: string;
    sortName?: string | null;
    description?: string | null;
  }): Promise<EbookGroupIdResponseDto> {
    const name = normalizeName(input.name);
    if (!name) throw new BadRequestException('Name is required');

    const [row] = await this.db
      .insert(schema.ebookGroups)
      .values({
        name,
        sortName: normalizeOptionalText(input.sortName),
        description: normalizeOptionalText(input.description),
      })
      .returning({ id: schema.ebookGroups.id });

    this.appEvents.ebookGroupCreated(row.id);
    this.wsEvents.ebookGroupCreated(row.id);
    return { id: row.id };
  }

  async update(
    id: string,
    input: {
      name?: string;
      sortName?: string | null;
      description?: string | null;
    },
  ): Promise<EbookGroupSuccessResponseDto> {
    await this.requireGroup(id);

    const fields: {
      name?: string;
      sortName?: string | null;
      description?: string | null;
    } = {};
    if (input.name !== undefined) {
      const name = normalizeName(input.name);
      if (!name) throw new BadRequestException('Name is required');
      fields.name = name;
    }
    if (input.sortName !== undefined) {
      fields.sortName = normalizeOptionalText(input.sortName);
    }
    if (input.description !== undefined) {
      fields.description = normalizeOptionalText(input.description);
    }
    if (Object.keys(fields).length === 0) return { success: true };

    await this.db
      .update(schema.ebookGroups)
      .set(fields)
      .where(eq(schema.ebookGroups.id, id));
    this.emitUpdated(id);
    return { success: true };
  }

  async remove(id: string): Promise<void> {
    await this.requireGroup(id);
    await this.db
      .delete(schema.ebookGroups)
      .where(eq(schema.ebookGroups.id, id));
    await this.removeCoverFile(id);
    this.appEvents.ebookGroupDeleted(id);
    this.wsEvents.ebookGroupDeleted(id);
  }

  async addEbook(
    groupId: string,
    input: { ebookId: string; role?: string | null },
  ): Promise<EbookGroupSuccessResponseDto> {
    const changed = await this.withGroupLock(groupId, async (tx) => {
      await this.requireEbook(input.ebookId, tx);

      const [existing] = await tx
        .select({ ebookId: schema.ebookGroupMembers.ebookId })
        .from(schema.ebookGroupMembers)
        .where(
          and(
            eq(schema.ebookGroupMembers.groupId, groupId),
            eq(schema.ebookGroupMembers.ebookId, input.ebookId),
          ),
        )
        .limit(1);

      if (existing) {
        if (input.role === undefined) return false;
        await tx
          .update(schema.ebookGroupMembers)
          .set({ role: normalizeRole(input.role) })
          .where(
            and(
              eq(schema.ebookGroupMembers.groupId, groupId),
              eq(schema.ebookGroupMembers.ebookId, input.ebookId),
            ),
          );
        return true;
      }

      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${schema.ebookGroupMembers.position}), -1)`,
        })
        .from(schema.ebookGroupMembers)
        .where(eq(schema.ebookGroupMembers.groupId, groupId));

      await tx.insert(schema.ebookGroupMembers).values({
        groupId,
        ebookId: input.ebookId,
        position: Number(max) + 1,
        role: normalizeRole(input.role),
      });
      return true;
    });
    if (changed) this.emitUpdated(groupId);
    return { success: true };
  }

  async updateMember(
    groupId: string,
    ebookId: string,
    role: string | null,
  ): Promise<EbookGroupSuccessResponseDto> {
    await this.withGroupLock(groupId, async (tx) => {
      const updated = await tx
        .update(schema.ebookGroupMembers)
        .set({ role: normalizeRole(role) })
        .where(
          and(
            eq(schema.ebookGroupMembers.groupId, groupId),
            eq(schema.ebookGroupMembers.ebookId, ebookId),
          ),
        )
        .returning({ ebookId: schema.ebookGroupMembers.ebookId });
      if (updated.length === 0) {
        throw new NotFoundException('Ebook is not in this group');
      }
    });
    this.emitUpdated(groupId);
    return { success: true };
  }

  async removeEbook(
    groupId: string,
    ebookId: string,
  ): Promise<EbookGroupSuccessResponseDto> {
    await this.withGroupLock(groupId, async (tx) => {
      await tx
        .delete(schema.ebookGroupMembers)
        .where(
          and(
            eq(schema.ebookGroupMembers.groupId, groupId),
            eq(schema.ebookGroupMembers.ebookId, ebookId),
          ),
        );
    });
    this.emitUpdated(groupId);
    return { success: true };
  }

  async reorder(
    groupId: string,
    ebookIds: string[],
  ): Promise<EbookGroupSuccessResponseDto> {
    await this.withGroupLock(groupId, async (tx) => {
      const stored = await tx
        .select({ ebookId: schema.ebookGroupMembers.ebookId })
        .from(schema.ebookGroupMembers)
        .where(eq(schema.ebookGroupMembers.groupId, groupId))
        .orderBy(
          asc(schema.ebookGroupMembers.position),
          asc(schema.ebookGroupMembers.ebookId),
        );

      let ordered: string[];
      try {
        ordered = mergeMemberOrder(
          stored.map((row) => row.ebookId),
          ebookIds,
        );
      } catch (error) {
        if (error instanceof MemberOrderError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      for (const [position, ebookId] of ordered.entries()) {
        await tx
          .update(schema.ebookGroupMembers)
          .set({ position })
          .where(
            and(
              eq(schema.ebookGroupMembers.groupId, groupId),
              eq(schema.ebookGroupMembers.ebookId, ebookId),
            ),
          );
      }
    });
    this.emitUpdated(groupId);
    return { success: true };
  }

  async updateCoverFromFile(
    id: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromFile(buffer, this.coverConfig(id));
  }

  async updateCoverFromUrl(
    id: string,
    url: string,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromUrl(url, this.coverConfig(id));
  }

  async getCover(
    id: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const group = await this.requireGroup(id);
    if (!group.coverUrl && !group.coverSource) return null;
    try {
      const data = await fs.readFile(this.appData.getEbookGroupCoverPath(id));
      return { data, mimeType: 'image/jpeg' };
    } catch {
      return null;
    }
  }

  async clearCover(id: string): Promise<EbookGroupSuccessResponseDto> {
    const group = await this.requireGroup(id);
    if (group.coverUrl || group.coverSource) {
      await this.db
        .update(schema.ebookGroups)
        .set({ coverUrl: null, coverSource: null })
        .where(eq(schema.ebookGroups.id, id));
      await this.removeCoverFile(id);
      this.emitUpdated(id);
    }
    return { success: true };
  }

  private async loadMembers(
    groupIds: string[],
    userId: string,
    excludeEbookId?: string,
  ): Promise<Map<string, EbookGroupMemberDto[]>> {
    const grouped = new Map<string, EbookGroupMemberDto[]>();
    if (groupIds.length === 0) return grouped;

    const conditions: SQL[] = [
      inArray(schema.ebookGroupMembers.groupId, groupIds),
      ne(schema.ebooks.status, 'hidden'),
      this.visibleToUser(userId),
    ];
    if (excludeEbookId) {
      conditions.push(ne(schema.ebooks.id, excludeEbookId));
    }

    const rows: MemberRow[] = await this.db
      .select({
        groupId: schema.ebookGroupMembers.groupId,
        id: schema.ebooks.id,
        title: schema.ebooks.title,
        coverUrl: schema.ebooks.coverUrl,
        coverSource: schema.ebooks.coverSource,
        status: schema.ebooks.status,
        role: schema.ebookGroupMembers.role,
        position: schema.ebookGroupMembers.position,
      })
      .from(schema.ebookGroupMembers)
      .innerJoin(
        schema.ebooks,
        eq(schema.ebookGroupMembers.ebookId, schema.ebooks.id),
      )
      .where(and(...conditions))
      .orderBy(asc(schema.ebookGroupMembers.position), asc(schema.ebooks.id));

    const metadata = await this.metadataResolver.forEbooks(
      rows.map((row) => row.id),
    );

    for (const row of rows) {
      const resolved = metadata.get(row.id);
      const member: EbookGroupMemberDto = {
        id: row.id,
        title: resolved?.title ?? row.title,
        coverUrl: this.coverService.getCoverUrl(
          row.id,
          row.coverUrl,
          row.coverSource,
          'ebooks',
        ),
        role: row.role,
        position: row.position,
        status: row.status,
        authors: resolved?.authorNames ?? [],
      };
      const list = grouped.get(row.groupId) ?? [];
      list.push(member);
      grouped.set(row.groupId, list);
    }
    return grouped;
  }

  private async firstVisibleCovers(
    groupIds: string[],
    userId: string,
  ): Promise<Map<string, string | null>> {
    const covers = new Map<string, string | null>();
    if (groupIds.length === 0) return covers;

    const rows = await this.db
      .selectDistinctOn([schema.ebookGroupMembers.groupId], {
        groupId: schema.ebookGroupMembers.groupId,
        ebookId: schema.ebooks.id,
        coverUrl: schema.ebooks.coverUrl,
        coverSource: schema.ebooks.coverSource,
      })
      .from(schema.ebookGroupMembers)
      .innerJoin(
        schema.ebooks,
        eq(schema.ebookGroupMembers.ebookId, schema.ebooks.id),
      )
      .where(
        and(
          inArray(schema.ebookGroupMembers.groupId, groupIds),
          ne(schema.ebooks.status, 'hidden'),
          this.visibleToUser(userId),
        ),
      )
      .orderBy(
        asc(schema.ebookGroupMembers.groupId),
        asc(schema.ebookGroupMembers.position),
        asc(schema.ebooks.id),
      );

    for (const row of rows) {
      covers.set(
        row.groupId,
        this.coverService.getCoverUrl(
          row.ebookId,
          row.coverUrl,
          row.coverSource,
          'ebooks',
        ),
      );
    }
    return covers;
  }

  private ownCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: string | null,
  ): string | null {
    return this.coverService.getCoverUrl(
      id,
      coverUrl,
      coverSource,
      'ebooks/groups',
    );
  }

  private coverConfig(id: string): CoverOperationConfig {
    return {
      entityId: id,
      apiPath: 'ebooks/groups',
      getCoverPath: (entityId) => this.appData.getEbookGroupCoverPath(entityId),
      verifyExists: async (entityId) => {
        await this.requireGroup(entityId);
      },
      updateCoverMetadata: async (entityId, coverUrl) => {
        await this.db
          .update(schema.ebookGroups)
          .set({ coverUrl, coverSource: 'uploaded' })
          .where(eq(schema.ebookGroups.id, entityId));
      },
      emitUpdateEvent: (entityId) => this.emitUpdated(entityId),
    };
  }

  private async requireGroup(id: string) {
    const [group] = await this.db
      .select()
      .from(schema.ebookGroups)
      .where(eq(schema.ebookGroups.id, id))
      .limit(1);
    if (!group) throw new NotFoundException('Ebook group not found');
    return group;
  }

  /**
   * Serialize membership writes on the parent row, before reading positions or
   * locking members. This also coordinates with group deletion across processes.
   * Callers emit events only after this transaction has committed.
   */
  private withGroupLock<T>(
    id: string,
    mutate: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: schema.ebookGroups.id })
        .from(schema.ebookGroups)
        .where(eq(schema.ebookGroups.id, id))
        .limit(1)
        .for('update');
      if (!group) throw new NotFoundException('Ebook group not found');
      return mutate(tx);
    });
  }

  private async requireEbook(id: string, db: Pick<Db, 'select'> = this.db) {
    const [ebook] = await db
      .select({ id: schema.ebooks.id })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);
    if (!ebook) throw new NotFoundException('Ebook not found');
  }

  private emitUpdated(id: string) {
    this.appEvents.ebookGroupUpdated(id);
    this.wsEvents.ebookGroupUpdated(id);
  }

  private async removeCoverFile(id: string): Promise<void> {
    try {
      await fs.unlink(this.appData.getEbookGroupCoverPath(id));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Failed to delete cover for ebook group ${id}`);
      }
    }
  }
}
