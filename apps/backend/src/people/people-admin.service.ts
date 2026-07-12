import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';
import type {
  AdminPersonDto,
  MergePersonResultDto,
  RenamePersonConflictDto,
  SplitPersonResultDto,
} from './dto/admin-person.dto';

type PersonRow = typeof audiobookSchema.people.$inferSelect;

@Injectable()
export class PeopleAdminService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
  ) {}

  async findAuthors(search?: string): Promise<AdminPersonDto[]> {
    const where = this.buildWhereClause(search, [
      sql`EXISTS (
        SELECT 1 FROM audiobook_authors aa
        WHERE aa.person_id = ${audiobookSchema.people.id}
      )`,
      sql`EXISTS (
        SELECT 1 FROM ebook_authors ea
        WHERE ea.person_id = ${audiobookSchema.people.id}
      )`,
    ]);

    return this.db
      .select({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
        audiobookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM audiobook_authors aa
          WHERE aa.person_id = ${audiobookSchema.people.id}
        )`,
        ebookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ebook_authors ea
          WHERE ea.person_id = ${audiobookSchema.people.id}
        )`,
        audiobookNarratorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM audiobook_narrators an
          WHERE an.person_id = ${audiobookSchema.people.id}
        )`,
      })
      .from(audiobookSchema.people)
      .where(where)
      .orderBy(asc(audiobookSchema.people.name));
  }

  async findNarrators(search?: string): Promise<AdminPersonDto[]> {
    const where = this.buildWhereClause(search, [
      sql`EXISTS (
        SELECT 1 FROM audiobook_narrators an
        WHERE an.person_id = ${audiobookSchema.people.id}
      )`,
    ]);

    return this.db
      .select({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
        audiobookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM audiobook_authors aa
          WHERE aa.person_id = ${audiobookSchema.people.id}
        )`,
        ebookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ebook_authors ea
          WHERE ea.person_id = ${audiobookSchema.people.id}
        )`,
        audiobookNarratorCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM audiobook_narrators an
          WHERE an.person_id = ${audiobookSchema.people.id}
        )`,
      })
      .from(audiobookSchema.people)
      .where(where)
      .orderBy(asc(audiobookSchema.people.name));
  }

  async rename(
    id: string,
    newName: string,
  ): Promise<AdminPersonDto | RenamePersonConflictDto> {
    const [person] = await this.db
      .select()
      .from(audiobookSchema.people)
      .where(eq(audiobookSchema.people.id, id));

    if (!person) {
      throw new NotFoundException('Person not found');
    }

    if (person.name === newName) {
      return {
        id: person.id,
        name: person.name,
        ...(await this.getCounts(id)),
      };
    }

    const [existing] = await this.db
      .select()
      .from(audiobookSchema.people)
      .where(
        and(
          sql`LOWER(${audiobookSchema.people.name}) = LOWER(${newName})`,
          ne(audiobookSchema.people.id, id),
        ),
      );

    if (existing) {
      return {
        conflict: true,
        existingPerson: { id: existing.id, name: existing.name },
        sourcePerson: { id: person.id, name: person.name },
        ...(await this.getCounts(id)),
      };
    }

    await this.db
      .update(audiobookSchema.people)
      .set({ name: newName })
      .where(eq(audiobookSchema.people.id, id));

    return { id: person.id, name: newName, ...(await this.getCounts(id)) };
  }

  async merge(
    sourceId: string,
    targetId: string,
  ): Promise<MergePersonResultDto> {
    if (sourceId === targetId) {
      throw new BadRequestException('Cannot merge a person with itself');
    }

    return this.db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(audiobookSchema.people)
        .where(eq(audiobookSchema.people.id, sourceId));
      const [target] = await tx
        .select()
        .from(audiobookSchema.people)
        .where(eq(audiobookSchema.people.id, targetId));

      if (!source) {
        throw new NotFoundException('Source person not found');
      }
      if (!target) {
        throw new NotFoundException('Target person not found');
      }

      const sourceCounts = await this.getCounts(sourceId, tx);

      await this.moveAudiobookAuthorLinks(tx, sourceId, targetId);
      await this.moveEbookAuthorLinks(tx, sourceId, targetId);
      await this.moveAudiobookNarratorLinks(tx, sourceId, targetId);

      await tx
        .delete(audiobookSchema.people)
        .where(eq(audiobookSchema.people.id, sourceId));

      return {
        id: target.id,
        name: target.name,
        audiobookAuthorLinksMerged: sourceCounts.audiobookAuthorCount,
        ebookAuthorLinksMerged: sourceCounts.ebookAuthorCount,
        audiobookNarratorLinksMerged: sourceCounts.audiobookNarratorCount,
      };
    });
  }

  async split(
    sourceId: string,
    names: string[],
  ): Promise<SplitPersonResultDto> {
    const normalizedNames = this.normalizeNames(names);

    return this.db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(audiobookSchema.people)
        .where(eq(audiobookSchema.people.id, sourceId));

      if (!source) {
        throw new NotFoundException('Person not found');
      }

      const filteredNames = normalizedNames.filter(
        (name) => name.toLowerCase() !== source.name.toLowerCase(),
      );

      if (filteredNames.length < 2) {
        throw new BadRequestException('Provide at least two distinct names');
      }

      const sourceCounts = await this.getCounts(sourceId, tx);
      const replacementPeople = await Promise.all(
        filteredNames.map((name) => this.getOrCreatePerson(tx, name)),
      );

      const audiobookAuthorLinks = await tx
        .select({
          audiobookId: audiobookSchema.audiobookAuthors.audiobookId,
          order: audiobookSchema.audiobookAuthors.order,
        })
        .from(audiobookSchema.audiobookAuthors)
        .where(eq(audiobookSchema.audiobookAuthors.personId, sourceId));

      const ebookAuthorLinks = await tx
        .select({
          ebookId: ebookSchema.ebookAuthors.ebookId,
          order: ebookSchema.ebookAuthors.order,
        })
        .from(ebookSchema.ebookAuthors)
        .where(eq(ebookSchema.ebookAuthors.personId, sourceId));

      const audiobookNarratorLinks = await tx
        .select({
          audiobookId: audiobookSchema.audiobookNarrators.audiobookId,
          order: audiobookSchema.audiobookNarrators.order,
        })
        .from(audiobookSchema.audiobookNarrators)
        .where(eq(audiobookSchema.audiobookNarrators.personId, sourceId));

      await this.replaceAudiobookAuthorLinks(
        tx,
        audiobookAuthorLinks,
        replacementPeople,
        sourceId,
      );
      await this.replaceEbookAuthorLinks(
        tx,
        ebookAuthorLinks,
        replacementPeople,
        sourceId,
      );
      await this.replaceAudiobookNarratorLinks(
        tx,
        audiobookNarratorLinks,
        replacementPeople,
        sourceId,
      );

      await tx
        .delete(audiobookSchema.people)
        .where(eq(audiobookSchema.people.id, sourceId));

      return {
        id: source.id,
        names: filteredNames,
        audiobookAuthorLinksSplit: sourceCounts.audiobookAuthorCount,
        ebookAuthorLinksSplit: sourceCounts.ebookAuthorCount,
        audiobookNarratorLinksSplit: sourceCounts.audiobookNarratorCount,
      };
    });
  }

  private buildWhereClause(search: string | undefined, roleClauses: SQL[]) {
    // A person belongs to the role if ANY of the role clauses match
    const parts: SQL[] = [];
    const roleClause =
      roleClauses.length === 1 ? roleClauses[0] : or(...roleClauses);
    if (roleClause) {
      parts.push(roleClause);
    }
    if (search?.trim()) {
      parts.push(ilike(audiobookSchema.people.name, `%${search.trim()}%`));
    }
    return parts.length > 0 ? and(...parts) : undefined;
  }

  private normalizeNames(names: string[]) {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;

      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      normalized.push(trimmed);
    }

    return normalized;
  }

  private async getCounts(
    id: string,
    tx = this.db,
  ): Promise<{
    audiobookAuthorCount: number;
    ebookAuthorCount: number;
    audiobookNarratorCount: number;
  }> {
    const [result] = await tx
      .select({
        audiobookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int FROM audiobook_authors WHERE person_id = ${id}
        )`,
        ebookAuthorCount: sql<number>`(
          SELECT COUNT(*)::int FROM ebook_authors WHERE person_id = ${id}
        )`,
        audiobookNarratorCount: sql<number>`(
          SELECT COUNT(*)::int FROM audiobook_narrators WHERE person_id = ${id}
        )`,
      })
      .from(sql`(SELECT 1) AS dummy`);

    return result;
  }

  private async getOrCreatePerson(tx: any, name: string): Promise<PersonRow> {
    const [existing] = await tx
      .select()
      .from(audiobookSchema.people)
      .where(sql`LOWER(${audiobookSchema.people.name}) = LOWER(${name})`)
      .limit(1);

    if (existing) {
      return existing;
    }

    const inserted = await tx
      .insert(audiobookSchema.people)
      .values({ name })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return inserted[0];
    }

    const [fallback] = await tx
      .select()
      .from(audiobookSchema.people)
      .where(sql`LOWER(${audiobookSchema.people.name}) = LOWER(${name})`)
      .limit(1);

    if (!fallback) {
      throw new NotFoundException(`Person not found: ${name}`);
    }

    return fallback;
  }

  private async moveAudiobookAuthorLinks(
    tx: any,
    sourceId: string,
    targetId: string,
  ) {
    await tx.execute(sql`
      UPDATE audiobook_authors AS aa
      SET person_id = ${targetId}
      WHERE aa.person_id = ${sourceId}
        AND NOT EXISTS (
          SELECT 1
          FROM audiobook_authors existing
          WHERE existing.person_id = ${targetId}
            AND existing.audiobook_id = aa.audiobook_id
        )
    `);

    await tx
      .delete(audiobookSchema.audiobookAuthors)
      .where(eq(audiobookSchema.audiobookAuthors.personId, sourceId));
  }

  private async moveEbookAuthorLinks(
    tx: any,
    sourceId: string,
    targetId: string,
  ) {
    await tx.execute(sql`
      UPDATE ebook_authors AS ea
      SET person_id = ${targetId}
      WHERE ea.person_id = ${sourceId}
        AND NOT EXISTS (
          SELECT 1
          FROM ebook_authors existing
          WHERE existing.person_id = ${targetId}
            AND existing.ebook_id = ea.ebook_id
        )
    `);

    await tx
      .delete(ebookSchema.ebookAuthors)
      .where(eq(ebookSchema.ebookAuthors.personId, sourceId));
  }

  private async moveAudiobookNarratorLinks(
    tx: any,
    sourceId: string,
    targetId: string,
  ) {
    await tx.execute(sql`
      UPDATE audiobook_narrators AS an
      SET person_id = ${targetId}
      WHERE an.person_id = ${sourceId}
        AND NOT EXISTS (
          SELECT 1
          FROM audiobook_narrators existing
          WHERE existing.person_id = ${targetId}
            AND existing.audiobook_id = an.audiobook_id
        )
    `);

    await tx
      .delete(audiobookSchema.audiobookNarrators)
      .where(eq(audiobookSchema.audiobookNarrators.personId, sourceId));
  }

  private async replaceAudiobookAuthorLinks(
    tx: any,
    links: Array<{ audiobookId: string; order: number }>,
    replacementPeople: PersonRow[],
    sourceId: string,
  ) {
    if (links.length === 0) {
      return;
    }

    const values = links.flatMap((link) =>
      replacementPeople.map((person) => ({
        audiobookId: link.audiobookId,
        personId: person.id,
        order: link.order,
      })),
    );

    await tx
      .insert(audiobookSchema.audiobookAuthors)
      .values(values)
      .onConflictDoNothing();

    await tx
      .delete(audiobookSchema.audiobookAuthors)
      .where(eq(audiobookSchema.audiobookAuthors.personId, sourceId));
  }

  private async replaceEbookAuthorLinks(
    tx: any,
    links: Array<{ ebookId: string; order: number }>,
    replacementPeople: PersonRow[],
    sourceId: string,
  ) {
    if (links.length === 0) {
      return;
    }

    const values = links.flatMap((link) =>
      replacementPeople.map((person) => ({
        ebookId: link.ebookId,
        personId: person.id,
        order: link.order,
      })),
    );

    await tx
      .insert(ebookSchema.ebookAuthors)
      .values(values)
      .onConflictDoNothing();

    await tx
      .delete(ebookSchema.ebookAuthors)
      .where(eq(ebookSchema.ebookAuthors.personId, sourceId));
  }

  private async replaceAudiobookNarratorLinks(
    tx: any,
    links: Array<{ audiobookId: string; order: number }>,
    replacementPeople: PersonRow[],
    sourceId: string,
  ) {
    if (links.length === 0) {
      return;
    }

    const values = links.flatMap((link) =>
      replacementPeople.map((person) => ({
        audiobookId: link.audiobookId,
        personId: person.id,
        order: link.order,
      })),
    );

    await tx
      .insert(audiobookSchema.audiobookNarrators)
      .values(values)
      .onConflictDoNothing();

    await tx
      .delete(audiobookSchema.audiobookNarrators)
      .where(eq(audiobookSchema.audiobookNarrators.personId, sourceId));
  }
}
