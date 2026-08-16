import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { MetadataSource } from '../app-settings/schema';
import * as audiobookSchema from '../audiobooks/schema';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as ebookSchema from '../ebooks/schema';
import { resolveRelationByPriority } from './utils/metadata-priority.utils';
import { splitPersonNames } from './utils/name.utils';

type MediaType = 'audiobook' | 'ebook';
type ExternalBookSource = Extract<MetadataSource, 'hardcover' | 'goodreads'>;

export interface ExternalSeriesMetadata {
  name: string;
  order?: string | null;
}

export interface CanonicalPerson {
  id: string;
  name: string;
}

export interface CanonicalSeries {
  id: string;
  name: string;
}

/**
 * Turns relationship metadata from external providers into normal library
 * entities. Provider rows remain the source-specific cache, while people and
 * series shown by the API always use real UUIDs that can be routed to and
 * managed by the rest of the application.
 */
@Injectable()
export class MetadataEntityService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
    private readonly appSettingsService: AppSettingsService,
  ) {}

  async materializeExternalMetadata(
    mediaType: MediaType,
    mediaId: string,
    source: ExternalBookSource,
    authorNames: string[],
    series?: ExternalSeriesMetadata | null,
  ): Promise<void> {
    const normalizedAuthorNames = splitPersonNames(authorNames);
    const canonicalPeople = await this.ensurePeople(normalizedAuthorNames);
    const canonicalSeries = series?.name.trim()
      ? await this.ensureSeries(series.name)
      : null;

    const [book, currentAuthors, currentSeries, priority] = await Promise.all([
      this.getBook(mediaType, mediaId),
      this.getCurrentAuthors(mediaType, mediaId),
      this.getCurrentSeries(mediaType, mediaId),
      this.appSettingsService.getMetadataPriority(),
    ]);

    if (!book) return;

    // Older import code used plural relation names while the editor uses the
    // singular priority keys. Treat either spelling as the same manual lock.
    const manualFields = [...(book.manualFields ?? [])];
    if (manualFields.includes('authors') && !manualFields.includes('author')) {
      manualFields.push('author');
    }

    const currentAuthorNames = currentAuthors.map((author) => author.name);
    const resolvedAuthorNames = resolveRelationByPriority(
      'author',
      {
        manual: currentAuthorNames,
        embedded: currentAuthorNames,
        [source]: normalizedAuthorNames,
      },
      priority.author,
      manualFields,
    );

    if (
      resolvedAuthorNames === normalizedAuthorNames &&
      !this.sameNames(currentAuthorNames, normalizedAuthorNames)
    ) {
      await this.replaceAuthors(mediaType, mediaId, canonicalPeople);
    }

    if (!canonicalSeries || !series) return;

    const currentSeriesNames = currentSeries.map((entry) => entry.name);
    const externalSeriesNames = [canonicalSeries.name];
    const resolvedSeriesNames = resolveRelationByPriority(
      'series',
      {
        manual: currentSeriesNames,
        embedded: currentSeriesNames,
        [source]: externalSeriesNames,
      },
      priority.series,
      manualFields,
    );

    if (
      resolvedSeriesNames === externalSeriesNames &&
      !this.sameNames(currentSeriesNames, externalSeriesNames)
    ) {
      await this.replaceSeries(
        mediaType,
        mediaId,
        canonicalSeries.id,
        this.normalizeSeriesOrder(series.order),
      );
    }
  }

  async findPeopleByNames(
    names: string[],
  ): Promise<Map<string, CanonicalPerson>> {
    const uniqueNames = [...new Set(splitPersonNames(names))];
    if (uniqueNames.length === 0) return new Map();

    const rows = await this.db
      .select({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
      })
      .from(audiobookSchema.people)
      .where(inArray(audiobookSchema.people.name, uniqueNames));

    return new Map(rows.map((row) => [row.name.toLocaleLowerCase(), row]));
  }

  async findSeriesByNames(
    names: string[],
  ): Promise<Map<string, CanonicalSeries>> {
    const uniqueNames = [
      ...new Set(names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (uniqueNames.length === 0) return new Map();

    const rows = await this.db
      .select({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
      })
      .from(audiobookSchema.series)
      .where(
        inArray(
          sql`LOWER(${audiobookSchema.series.name})`,
          uniqueNames.map((name) => name.toLocaleLowerCase()),
        ),
      );

    return new Map(rows.map((row) => [row.name.toLocaleLowerCase(), row]));
  }

  private async ensurePeople(names: string[]): Promise<CanonicalPerson[]> {
    const people: CanonicalPerson[] = [];

    for (const name of names) {
      const [person] = await this.db
        .insert(audiobookSchema.people)
        .values({ name })
        .onConflictDoUpdate({
          target: audiobookSchema.people.name,
          set: { name },
        })
        .returning({
          id: audiobookSchema.people.id,
          name: audiobookSchema.people.name,
        });
      people.push(person);
    }

    return people;
  }

  private async ensureSeries(name: string): Promise<CanonicalSeries> {
    const trimmedName = name.trim();
    const [existing] = await this.db
      .select({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
      })
      .from(audiobookSchema.series)
      .where(sql`LOWER(${audiobookSchema.series.name}) = LOWER(${trimmedName})`)
      .limit(1);

    if (existing) return existing;

    const [created] = await this.db
      .insert(audiobookSchema.series)
      .values({ name: trimmedName })
      .returning({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
      });
    return created;
  }

  private async getBook(mediaType: MediaType, mediaId: string) {
    if (mediaType === 'audiobook') {
      const [book] = await this.db
        .select({ manualFields: audiobookSchema.audiobooks.manualFields })
        .from(audiobookSchema.audiobooks)
        .where(eq(audiobookSchema.audiobooks.id, mediaId))
        .limit(1);
      return book;
    }

    const [book] = await this.db
      .select({ manualFields: ebookSchema.ebooks.manualFields })
      .from(ebookSchema.ebooks)
      .where(eq(ebookSchema.ebooks.id, mediaId))
      .limit(1);
    return book;
  }

  private async getCurrentAuthors(
    mediaType: MediaType,
    mediaId: string,
  ): Promise<CanonicalPerson[]> {
    if (mediaType === 'audiobook') {
      return this.db
        .select({
          id: audiobookSchema.people.id,
          name: audiobookSchema.people.name,
        })
        .from(audiobookSchema.audiobookAuthors)
        .innerJoin(
          audiobookSchema.people,
          eq(
            audiobookSchema.audiobookAuthors.personId,
            audiobookSchema.people.id,
          ),
        )
        .where(eq(audiobookSchema.audiobookAuthors.audiobookId, mediaId))
        .orderBy(asc(audiobookSchema.audiobookAuthors.order));
    }

    return this.db
      .select({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
      })
      .from(ebookSchema.ebookAuthors)
      .innerJoin(
        audiobookSchema.people,
        eq(ebookSchema.ebookAuthors.personId, audiobookSchema.people.id),
      )
      .where(eq(ebookSchema.ebookAuthors.ebookId, mediaId))
      .orderBy(asc(ebookSchema.ebookAuthors.order));
  }

  private async getCurrentSeries(
    mediaType: MediaType,
    mediaId: string,
  ): Promise<Array<CanonicalSeries & { order: string }>> {
    if (mediaType === 'audiobook') {
      return this.db
        .select({
          id: audiobookSchema.series.id,
          name: audiobookSchema.series.name,
          order: audiobookSchema.audiobookSeries.order,
        })
        .from(audiobookSchema.audiobookSeries)
        .innerJoin(
          audiobookSchema.series,
          eq(
            audiobookSchema.audiobookSeries.seriesId,
            audiobookSchema.series.id,
          ),
        )
        .where(eq(audiobookSchema.audiobookSeries.audiobookId, mediaId));
    }

    return this.db
      .select({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
        order: ebookSchema.ebookSeries.order,
      })
      .from(ebookSchema.ebookSeries)
      .innerJoin(
        audiobookSchema.series,
        eq(ebookSchema.ebookSeries.seriesId, audiobookSchema.series.id),
      )
      .where(eq(ebookSchema.ebookSeries.ebookId, mediaId));
  }

  private async replaceAuthors(
    mediaType: MediaType,
    mediaId: string,
    people: CanonicalPerson[],
  ): Promise<void> {
    if (mediaType === 'audiobook') {
      await this.db
        .delete(audiobookSchema.audiobookAuthors)
        .where(eq(audiobookSchema.audiobookAuthors.audiobookId, mediaId));
      if (people.length > 0) {
        await this.db.insert(audiobookSchema.audiobookAuthors).values(
          people.map((person, order) => ({
            audiobookId: mediaId,
            personId: person.id,
            order,
          })),
        );
      }
      return;
    }

    await this.db
      .delete(ebookSchema.ebookAuthors)
      .where(eq(ebookSchema.ebookAuthors.ebookId, mediaId));
    if (people.length > 0) {
      await this.db.insert(ebookSchema.ebookAuthors).values(
        people.map((person, order) => ({
          ebookId: mediaId,
          personId: person.id,
          order,
        })),
      );
    }
  }

  private async replaceSeries(
    mediaType: MediaType,
    mediaId: string,
    seriesId: string,
    order: string,
  ): Promise<void> {
    if (mediaType === 'audiobook') {
      await this.db
        .delete(audiobookSchema.audiobookSeries)
        .where(eq(audiobookSchema.audiobookSeries.audiobookId, mediaId));
      await this.db.insert(audiobookSchema.audiobookSeries).values({
        audiobookId: mediaId,
        seriesId,
        order,
      });
      return;
    }

    await this.db
      .delete(ebookSchema.ebookSeries)
      .where(eq(ebookSchema.ebookSeries.ebookId, mediaId));
    await this.db.insert(ebookSchema.ebookSeries).values({
      ebookId: mediaId,
      seriesId,
      order,
    });
  }

  private normalizeSeriesOrder(order: string | null | undefined): string {
    const parsed = Number.parseFloat(order ?? '');
    return Number.isFinite(parsed) ? String(parsed) : '0';
  }

  private sameNames(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every(
        (name, index) =>
          name.toLocaleLowerCase() === right[index]?.toLocaleLowerCase(),
      )
    );
  }
}
