import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  ilike,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { CoverService } from '../common/cover.service';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import {
  AUDIOBOOK_GAP_FIX_METHODS,
  AUDIOBOOK_GAP_KEYS,
  EBOOK_GAP_FIX_METHODS,
  EBOOK_GAP_KEYS,
  buildAudiobookGapConditions,
  buildEbookGapConditions,
  countFilters,
  gapCountExpression,
  type GapDatabase,
  type GapKey,
} from './gap-definitions';
import {
  type GapMediaType,
  type ListMetadataGapsQueryDto,
  type MetadataGapItemDto,
  type MetadataGapListDto,
  type MetadataGapsSummaryDto,
} from './dto/metadata-gaps.dto';

const DEFAULT_LIMIT = 50;

/**
 * The admin worklist behind issue #61: which items in the library still need
 * metadata, and what kind of work each one needs.
 *
 * Gaps are computed on the fly rather than materialised into a column or a
 * side table. They change on every scan, every external link, every edit and
 * every change to the metadata-priority settings, so a stored copy would need
 * invalidation hooks in half a dozen modules and would still go stale. Two
 * indexed queries per page load is the cheaper trade at self-hosted scale —
 * every junction table these conditions touch is indexed on its parent id.
 */
@Injectable()
export class MetadataGapsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: GapDatabase,
    private readonly appSettingsService: AppSettingsService,
    private readonly coverService: CoverService,
  ) {}

  async getSummary(type: GapMediaType): Promise<MetadataGapsSummaryDto> {
    return type === 'audiobook'
      ? this.getAudiobookSummary()
      : this.getEbookSummary();
  }

  async list(query: ListMetadataGapsQueryDto): Promise<MetadataGapListDto> {
    return query.type === 'audiobook'
      ? this.listAudiobooks(query)
      : this.listEbooks(query);
  }

  private async getAudiobookSummary(): Promise<MetadataGapsSummaryDto> {
    const priority = await this.appSettingsService.getMetadataPriority();
    const conditions = buildAudiobookGapConditions(this.db, priority);
    const visible = ne(audiobooksSchema.audiobooks.status, 'hidden');

    const [row] = await this.db
      .select({
        totalItems: count(),
        itemsWithGaps: sql<number>`count(*) FILTER (WHERE ${anyOf(
          AUDIOBOOK_GAP_KEYS.map((key) => conditions[key]),
        )})`.mapWith(Number),
        ...countFilters(conditions),
      })
      .from(audiobooksSchema.audiobooks)
      .where(visible);

    return {
      type: 'audiobook',
      totalItems: Number(row?.totalItems ?? 0),
      itemsWithGaps: Number(row?.itemsWithGaps ?? 0),
      gaps: AUDIOBOOK_GAP_KEYS.map((key) => ({
        key,
        count: Number(row?.[key] ?? 0),
        fixableBy: AUDIOBOOK_GAP_FIX_METHODS[key],
      })),
    };
  }

  private async getEbookSummary(): Promise<MetadataGapsSummaryDto> {
    const priority = await this.appSettingsService.getMetadataPriority();
    const conditions = buildEbookGapConditions(this.db, priority);
    const visible = ne(ebooksSchema.ebooks.status, 'hidden');

    const [row] = await this.db
      .select({
        totalItems: count(),
        itemsWithGaps: sql<number>`count(*) FILTER (WHERE ${anyOf(
          EBOOK_GAP_KEYS.map((key) => conditions[key]),
        )})`.mapWith(Number),
        ...countFilters(conditions),
      })
      .from(ebooksSchema.ebooks)
      .where(visible);

    return {
      type: 'ebook',
      totalItems: Number(row?.totalItems ?? 0),
      itemsWithGaps: Number(row?.itemsWithGaps ?? 0),
      gaps: EBOOK_GAP_KEYS.map((key) => ({
        key,
        count: Number(row?.[key] ?? 0),
        fixableBy: EBOOK_GAP_FIX_METHODS[key],
      })),
    };
  }

  private async listAudiobooks(
    query: ListMetadataGapsQueryDto,
  ): Promise<MetadataGapListDto> {
    const { limit = DEFAULT_LIMIT, offset = 0, sort = 'newest' } = query;
    const { audiobooks } = audiobooksSchema;
    const priority = await this.appSettingsService.getMetadataPriority();
    const conditions = buildAudiobookGapConditions(this.db, priority);

    const selectedKeys = selectKeys(AUDIOBOOK_GAP_KEYS, query.missing);
    const gapCount = gapCountExpression(conditions);
    const where = and(
      ne(audiobooks.status, 'hidden'),
      gapFilter(
        selectedKeys.map((key) => conditions[key]),
        query.match,
        query.missing,
      ),
      ...titleSearch(query.search, audiobooks.title, audiobooks.subtitle),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          id: audiobooks.id,
          title: audiobooks.title,
          subtitle: audiobooks.subtitle,
          coverUrl: audiobooks.coverUrl,
          coverSource: audiobooks.coverSource,
          status: audiobooks.status,
          createdAt: audiobooks.createdAt,
          gapCount,
          ...conditions,
        })
        .from(audiobooks)
        .where(where)
        .orderBy(
          ...orderFor(
            sort,
            audiobooks.title,
            audiobooks.createdAt,
            audiobooks.id,
            gapCount,
          ),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(audiobooks).where(where),
    ]);

    return {
      items: rows.map((row) =>
        this.toItem(row, 'audiobook', AUDIOBOOK_GAP_KEYS, 'audiobooks'),
      ),
      total: Number(totals?.value ?? 0),
    };
  }

  private async listEbooks(
    query: ListMetadataGapsQueryDto,
  ): Promise<MetadataGapListDto> {
    const { limit = DEFAULT_LIMIT, offset = 0, sort = 'newest' } = query;
    const { ebooks } = ebooksSchema;
    const priority = await this.appSettingsService.getMetadataPriority();
    const conditions = buildEbookGapConditions(this.db, priority);

    const selectedKeys = selectKeys(EBOOK_GAP_KEYS, query.missing);
    const gapCount = gapCountExpression(conditions);
    const where = and(
      ne(ebooks.status, 'hidden'),
      gapFilter(
        selectedKeys.map((key) => conditions[key]),
        query.match,
        query.missing,
      ),
      ...titleSearch(query.search, ebooks.title, ebooks.subtitle),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          id: ebooks.id,
          title: ebooks.title,
          subtitle: ebooks.subtitle,
          coverUrl: ebooks.coverUrl,
          coverSource: ebooks.coverSource,
          status: ebooks.status,
          createdAt: ebooks.createdAt,
          gapCount,
          ...conditions,
        })
        .from(ebooks)
        .where(where)
        .orderBy(
          ...orderFor(
            sort,
            ebooks.title,
            ebooks.createdAt,
            ebooks.id,
            gapCount,
          ),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(ebooks).where(where),
    ]);

    return {
      items: rows.map((row) =>
        this.toItem(row, 'ebook', EBOOK_GAP_KEYS, 'ebooks'),
      ),
      total: Number(totals?.value ?? 0),
    };
  }

  /**
   * Turns one row of gap booleans into the response shape. Fields are listed
   * explicitly so the raw columns behind them (file paths, cover filenames)
   * cannot leak into the response.
   */
  private toItem<K extends GapKey>(
    row: GapRow & Partial<Record<K, boolean>>,
    type: GapMediaType,
    keys: readonly K[],
    apiPath: string,
  ): MetadataGapItemDto {
    return {
      id: row.id,
      type,
      title: row.title,
      subtitle: row.subtitle,
      gaps: keys.filter((key) => row[key] === true),
      gapCount: Number(row.gapCount ?? 0),
      coverUrl: this.coverService.getCoverUrl(
        row.id,
        row.coverUrl,
        row.coverSource,
        apiPath,
      ),
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}

/** The non-gap columns every list row carries. */
interface GapRow {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  coverSource: string | null;
  status: string;
  createdAt: Date;
  gapCount: number;
}

/** Disjunction of gap conditions; `false` when there is nothing to match. */
export function anyOf(conditions: SQL<boolean>[]): SQL<boolean> {
  if (conditions.length === 0) return sql<boolean>`false`;
  return sql<boolean>`(${sql.join(conditions, sql` OR `)})`;
}

/** Conjunction of gap conditions; `false` when there is nothing to match. */
function allOf(conditions: SQL<boolean>[]): SQL<boolean> {
  if (conditions.length === 0) return sql<boolean>`false`;
  return sql<boolean>`(${sql.join(conditions, sql` AND `)})`;
}

/**
 * `match` qualifies an explicit selection of gaps. With none requested the
 * list means "anything still needing work", which is a disjunction whatever
 * `match` says — reading `match=all` there would ask for items missing every
 * single field, i.e. almost nothing, from a request that named no filter.
 */
export function gapFilter(
  conditions: SQL<boolean>[],
  match: 'any' | 'all' | undefined,
  requested: string[] | undefined,
): SQL<boolean> {
  return match === 'all' && requested?.length
    ? allOf(conditions)
    : anyOf(conditions);
}

/**
 * Narrows the requested gap keys to the ones this media type actually has.
 * With none requested the list means "anything still needing work", so every
 * key is in play.
 */
export function selectKeys<K extends GapKey>(
  available: readonly K[],
  requested: string[] | undefined,
): K[] {
  if (!requested?.length) return [...available];
  const wanted = new Set(requested);
  return available.filter((key) => wanted.has(key));
}

function titleSearch(
  search: string | undefined,
  title: AnyPgColumn,
  subtitle: AnyPgColumn,
): SQL[] {
  if (!search?.trim()) return [];
  const pattern = `%${search.trim()}%`;
  return [or(ilike(title, pattern), ilike(subtitle, pattern))!];
}

/**
 * Every branch ends on `id` so the order is total.
 *
 * None of the sort columns are unique — a batch import stamps one `created_at`
 * across many rows, and the same title appears in several editions. Without a
 * final tiebreaker Postgres is free to order ties differently between the two
 * `LIMIT/OFFSET` queries that make up consecutive pages, which in a worklist
 * you are meant to walk end-to-end shows some items twice and skips others.
 */
function orderFor(
  sort: 'newest' | 'oldest' | 'title' | 'mostGaps',
  title: AnyPgColumn,
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  gapCount: SQL<number>,
): SQL[] {
  switch (sort) {
    case 'oldest':
      return [asc(createdAt), asc(id)];
    case 'title':
      return [asc(title), asc(id)];
    // Ties on gap count are common, so newest-first decides them — the item
    // you just imported sits above one you have already walked past.
    case 'mostGaps':
      return [desc(gapCount), desc(createdAt), asc(id)];
    case 'newest':
    default:
      return [desc(createdAt), asc(id)];
  }
}
