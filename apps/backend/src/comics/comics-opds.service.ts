import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as usersSchema from '../users/schema';
import * as comicProgressSchema from '../comic-progress/schema';
import { ComicProgressService } from '../comic-progress/comic-progress.service';

type Db = NodePgDatabase<
  typeof schema &
    typeof audiobookSchema &
    typeof usersSchema &
    typeof comicProgressSchema
>;

interface IssueRow {
  id: string;
  seriesId: string;
  title: string | null;
  number: string | null;
  summary: string | null;
  coverDate: string | null;
  coverUrl: string | null;
  coverSource: string | null;
  pageCount: number | null;
  container: string;
  language: string | null;
  updatedAt: Date;
}

const PSE_NS = 'http://vaemendis.net/opds-pse/ns';
const PSE_REL = 'http://vaemendis.net/opds-pse/stream';

@Injectable()
export class ComicsOpdsService {
  private readonly logger = new Logger(ComicsOpdsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Db,
    private readonly progressService: ComicProgressService,
  ) {}

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private truncate(text: string | null, max = 500): string | null {
    if (!text) return null;
    const stripped = text.replace(/<[^>]*>/g, '');
    return stripped.length <= max ? stripped : stripped.slice(0, max) + '...';
  }

  /** API base (without /opds) for cover/download links on the existing comics controller. */
  private apiBase(baseUrl: string): string {
    return baseUrl.replace(/\/opds$/, '');
  }

  /** SQL fragment excluding series the user has blacklisted by tag. */
  private blacklistFilter(userId: string) {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${schema.comicSeriesTags} st
      INNER JOIN ${usersSchema.userBlacklistedTags} bt
        ON st.tag_id = bt.tag_id AND bt.user_id = ${userId}
      WHERE st.series_id = ${schema.comicSeries.id}
    )`;
  }

  /** Blacklist filter keyed off the book's seriesId (for book-level queries). */
  private seriesBlacklistForBook(userId: string) {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${schema.comicSeriesTags} st
      INNER JOIN ${usersSchema.userBlacklistedTags} bt
        ON st.tag_id = bt.tag_id AND bt.user_id = ${userId}
      WHERE st.series_id = ${schema.comicBooks.seriesId}
    )`;
  }

  async buildRootCatalog(baseUrl: string): Promise<string> {
    this.logger.log(`[comics-opds-svc] buildRootCatalog baseUrl=${baseUrl}`);
    const updated = new Date().toISOString();
    const e = (s: string) => this.escapeXml(s);
    const navType = (kind: 'navigation' | 'acquisition') =>
      `application/atom+xml;profile=opds-catalog;kind=${kind}`;
    const entry = (
      slug: string,
      title: string,
      kind: 'navigation' | 'acquisition',
      desc: string,
    ) => `
  <entry>
    <id>${e(baseUrl)}/${slug}</id>
    <title>${title}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/${slug}" type="${navType(kind)}"/>
    <content type="text">${e(desc)}</content>
  </entry>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${e(baseUrl)}</id>
  <title>Comic Library</title>
  <updated>${updated}</updated>
  <link rel="self" href="${e(baseUrl)}" type="${navType('navigation')}"/>
  <link rel="start" href="${e(baseUrl)}" type="${navType('navigation')}"/>
${entry('series', 'All Series', 'navigation', 'Browse all comic series')}
${entry('publishers', 'Publishers', 'navigation', 'Browse by publisher')}
${entry('collections', 'Collections', 'navigation', 'Browse comic collections')}
${entry('on-deck', 'On Deck', 'acquisition', 'Continue reading')}
${entry('recent', 'Recently Added', 'acquisition', 'Newest issues')}
</feed>`;
  }

  /** Build one issue <entry> including download + PSE links. Exposed for tests. */
  async buildIssueEntryXml(
    book: IssueRow,
    authorNames: string[],
    baseUrl: string,
    userId: string,
  ): Promise<string> {
    const e = (s: string) => this.escapeXml(s);
    const apiBase = this.apiBase(baseUrl);
    const title = book.title ?? `Issue #${book.number ?? ''}`.trim();
    const summary = this.truncate(book.summary);

    let entry = `
  <entry>
    <id>urn:uuid:${book.id}</id>
    <title>${e(title)}</title>
    <updated>${book.updatedAt.toISOString()}</updated>`;

    for (const name of authorNames) {
      entry += `
    <author><name>${e(name)}</name></author>`;
    }
    if (summary) {
      entry += `
    <summary>${e(summary)}</summary>`;
    }
    if (book.coverDate) {
      entry += `
    <published>${e(book.coverDate)}</published>`;
    }
    if (book.language) {
      entry += `
    <dc:language>${e(book.language)}</dc:language>`;
    }
    if (book.coverUrl || book.coverSource) {
      entry += `
    <link rel="http://opds-spec.org/image" href="${e(apiBase)}/books/${book.id}/cover" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${e(apiBase)}/books/${book.id}/cover" type="image/jpeg"/>`;
    }

    // Full-file download (existing comics endpoint)
    const downloadType =
      book.container === 'cbz'
        ? 'application/vnd.comicbook+zip'
        : book.container === 'cbr'
          ? 'application/vnd.comicbook-rar'
          : 'application/pdf';
    entry += `
    <link rel="http://opds-spec.org/acquisition" href="${e(apiBase)}/books/${book.id}/download" type="${downloadType}"/>`;

    // PSE stream link (only when page count is known)
    let hasPseLink = false;
    let hasProgress = false;
    if (book.pageCount && book.pageCount > 0) {
      const progress = await this.progressService.getProgress(userId, book.id);
      hasProgress = !!(progress && progress.currentPage > 0);
      let pseAttrs = `pse:count="${book.pageCount}"`;
      if (hasProgress) {
        pseAttrs += ` pse:lastRead="${progress!.currentPage}" pse:lastReadDate="${progress!.updatedAt}"`;
      }
      entry += `
    <link rel="${PSE_REL}" type="image/jpeg" href="${e(baseUrl)}/books/${book.id}/pages/{pageNumber}" ${pseAttrs}/>`;
      hasPseLink = true;
    }

    this.logger.log(
      `[comics-opds-svc] buildIssueEntryXml bookId=${book.id} pageCount=${book.pageCount ?? 'unknown'} hasPseLink=${hasPseLink} hasProgress=${hasProgress}`,
    );

    entry += `
  </entry>`;
    return entry;
  }

  private async authorNamesForBook(bookId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: audiobookSchema.people.name })
      .from(schema.comicBookCreators)
      .innerJoin(
        audiobookSchema.people,
        eq(schema.comicBookCreators.personId, audiobookSchema.people.id),
      )
      .where(eq(schema.comicBookCreators.bookId, bookId))
      .orderBy(asc(schema.comicBookCreators.order));
    return rows.map((r) => r.name);
  }

  private async buildAcquisitionFeed(opts: {
    id: string;
    title: string;
    baseUrl: string;
    books: IssueRow[];
    userId: string;
    upLink?: string;
  }): Promise<string> {
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const entries: string[] = [];
    for (const book of opts.books) {
      const names = await this.authorNamesForBook(book.id);
      entries.push(
        await this.buildIssueEntryXml(book, names, opts.baseUrl, opts.userId),
      );
    }
    const up = opts.upLink ?? opts.baseUrl;
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pse="${PSE_NS}">
  <id>${e(opts.id)}</id>
  <title>${e(opts.title)}</title>
  <updated>${updated}</updated>
  <link rel="self" href="${e(opts.id)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${e(opts.baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${e(up)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entries.join('')}
</feed>`;
  }

  // --- Navigation feeds ---

  async buildAllSeriesFeed(baseUrl: string, userId: string): Promise<string> {
    this.logger.log(`[comics-opds-svc] buildAllSeriesFeed userId=${userId}`);
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const seriesList = await this.db
      .select({
        id: schema.comicSeries.id,
        title: schema.comicSeries.title,
        sortTitle: schema.comicSeries.sortTitle,
      })
      .from(schema.comicSeries)
      .where(
        and(
          eq(schema.comicSeries.status, 'available'),
          this.blacklistFilter(userId),
        ),
      )
      .orderBy(
        asc(
          sql`COALESCE(${schema.comicSeries.sortTitle}, ${schema.comicSeries.title})`,
        ),
      );

    const entries = seriesList
      .map(
        (s) => `
  <entry>
    <id>${e(baseUrl)}/series/${s.id}</id>
    <title>${e(s.title)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/series/${s.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>`,
      )
      .join('');

    this.logger.log(
      `[comics-opds-svc] buildAllSeriesFeed resultCount=${seriesList.length} userId=${userId}`,
    );
    return this.navFeed(baseUrl, `${baseUrl}/series`, 'All Series', entries);
  }

  async buildPublishersFeed(baseUrl: string, userId: string): Promise<string> {
    this.logger.log(`[comics-opds-svc] buildPublishersFeed userId=${userId}`);
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const rows = await this.db
      .select({
        publisher: schema.comicSeries.publisher,
        count: sql<number>`count(*)`,
      })
      .from(schema.comicSeries)
      .where(
        and(
          eq(schema.comicSeries.status, 'available'),
          isNotNull(schema.comicSeries.publisher),
          this.blacklistFilter(userId),
        ),
      )
      .groupBy(schema.comicSeries.publisher)
      .orderBy(asc(schema.comicSeries.publisher));

    const entries = rows
      .map(
        (r) => `
  <entry>
    <id>${e(baseUrl)}/publishers/${encodeURIComponent(r.publisher!)}</id>
    <title>${e(r.publisher!)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/publishers/${encodeURIComponent(r.publisher!)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
    <content type="text">${r.count} series</content>
  </entry>`,
      )
      .join('');

    this.logger.log(
      `[comics-opds-svc] buildPublishersFeed resultCount=${rows.length} userId=${userId}`,
    );
    return this.navFeed(
      baseUrl,
      `${baseUrl}/publishers`,
      'Publishers',
      entries,
    );
  }

  async buildPublisherSeriesFeed(
    baseUrl: string,
    publisher: string,
    userId: string,
  ): Promise<string> {
    this.logger.log(
      `[comics-opds-svc] buildPublisherSeriesFeed publisher=${publisher} userId=${userId}`,
    );
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const seriesList = await this.db
      .select({ id: schema.comicSeries.id, title: schema.comicSeries.title })
      .from(schema.comicSeries)
      .where(
        and(
          eq(schema.comicSeries.status, 'available'),
          eq(schema.comicSeries.publisher, publisher),
          this.blacklistFilter(userId),
        ),
      )
      .orderBy(
        asc(
          sql`COALESCE(${schema.comicSeries.sortTitle}, ${schema.comicSeries.title})`,
        ),
      );

    const entries = seriesList
      .map(
        (s) => `
  <entry>
    <id>${e(baseUrl)}/series/${s.id}</id>
    <title>${e(s.title)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/series/${s.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>`,
      )
      .join('');

    this.logger.log(
      `[comics-opds-svc] buildPublisherSeriesFeed resultCount=${seriesList.length} publisher=${publisher} userId=${userId}`,
    );
    return this.navFeed(
      baseUrl,
      `${baseUrl}/publishers/${encodeURIComponent(publisher)}`,
      publisher,
      entries,
      `${baseUrl}/publishers`,
    );
  }

  async buildCollectionsFeed(baseUrl: string): Promise<string> {
    this.logger.log(
      `[comics-opds-svc] buildCollectionsFeed baseUrl=${baseUrl}`,
    );
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    // Intentionally lists all collections (names only, not their contents); the
    // series within a collection are blacklist-filtered in buildCollectionFeed.
    const rows = await this.db
      .select({
        id: schema.comicCollections.id,
        name: schema.comicCollections.name,
      })
      .from(schema.comicCollections)
      .orderBy(
        asc(
          sql`COALESCE(${schema.comicCollections.sortName}, ${schema.comicCollections.name})`,
        ),
      );

    const entries = rows
      .map(
        (c) => `
  <entry>
    <id>${e(baseUrl)}/collections/${c.id}</id>
    <title>${e(c.name)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/collections/${c.id}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  </entry>`,
      )
      .join('');

    this.logger.log(
      `[comics-opds-svc] buildCollectionsFeed resultCount=${rows.length}`,
    );
    return this.navFeed(
      baseUrl,
      `${baseUrl}/collections`,
      'Collections',
      entries,
    );
  }

  async buildCollectionFeed(
    baseUrl: string,
    collectionId: string,
    userId: string,
  ): Promise<string> {
    this.logger.log(
      `[comics-opds-svc] buildCollectionFeed collectionId=${collectionId} userId=${userId}`,
    );
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const [collection] = await this.db
      .select({
        id: schema.comicCollections.id,
        name: schema.comicCollections.name,
      })
      .from(schema.comicCollections)
      .where(eq(schema.comicCollections.id, collectionId))
      .limit(1);
    if (!collection) throw new NotFoundException('Collection not found');

    const seriesList = await this.db
      .select({
        id: schema.comicSeries.id,
        title: schema.comicSeries.title,
      })
      .from(schema.comicCollectionSeries)
      .innerJoin(
        schema.comicSeries,
        eq(schema.comicCollectionSeries.seriesId, schema.comicSeries.id),
      )
      .where(
        and(
          eq(schema.comicCollectionSeries.collectionId, collectionId),
          eq(schema.comicSeries.status, 'available'),
          this.blacklistFilter(userId),
        ),
      )
      .orderBy(asc(schema.comicCollectionSeries.position));

    const entries = seriesList
      .map(
        (s) => `
  <entry>
    <id>${e(baseUrl)}/series/${s.id}</id>
    <title>${e(s.title)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${e(baseUrl)}/series/${s.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>`,
      )
      .join('');

    this.logger.log(
      `[comics-opds-svc] buildCollectionFeed resultCount=${seriesList.length} collectionId=${collectionId} userId=${userId}`,
    );
    return this.navFeed(
      baseUrl,
      `${baseUrl}/collections/${collectionId}`,
      collection.name,
      entries,
      `${baseUrl}/collections`,
    );
  }

  // --- Acquisition feeds ---

  async buildSeriesFeed(
    baseUrl: string,
    seriesId: string,
    userId: string,
  ): Promise<string> {
    this.logger.log(
      `[comics-opds-svc] buildSeriesFeed seriesId=${seriesId} userId=${userId}`,
    );
    const [series] = await this.db
      .select({ id: schema.comicSeries.id, title: schema.comicSeries.title })
      .from(schema.comicSeries)
      .where(eq(schema.comicSeries.id, seriesId))
      .limit(1);
    if (!series) {
      this.logger.warn(
        `[comics-opds-svc] buildSeriesFeed series not found seriesId=${seriesId}`,
      );
      throw new NotFoundException('Series not found');
    }

    const books = (await this.db
      .select(this.issueColumns())
      .from(schema.comicBooks)
      .where(
        and(
          eq(schema.comicBooks.seriesId, seriesId),
          eq(schema.comicBooks.status, 'available'),
        ),
      )
      .orderBy(
        sql`${schema.comicBooks.sortNumber} ASC NULLS LAST`,
      )) as IssueRow[];

    this.logger.log(
      `[comics-opds-svc] buildSeriesFeed bookCount=${books.length} seriesId=${seriesId} userId=${userId}`,
    );
    return this.buildAcquisitionFeed({
      id: `${baseUrl}/series/${seriesId}`,
      title: series.title,
      baseUrl,
      books,
      userId,
      upLink: `${baseUrl}/series`,
    });
  }

  async buildOnDeckFeed(baseUrl: string, userId: string): Promise<string> {
    this.logger.log(`[comics-opds-svc] buildOnDeckFeed userId=${userId}`);
    const books = (await this.db
      .select(this.issueColumns())
      .from(schema.comicBooks)
      .innerJoin(
        comicProgressSchema.comicBookProgress,
        eq(
          comicProgressSchema.comicBookProgress.comicBookId,
          schema.comicBooks.id,
        ),
      )
      .where(
        and(
          eq(schema.comicBooks.status, 'available'),
          eq(comicProgressSchema.comicBookProgress.userId, userId),
          eq(comicProgressSchema.comicBookProgress.status, 'in_progress'),
          eq(comicProgressSchema.comicBookProgress.isHidden, false),
          this.seriesBlacklistForBook(userId),
        ),
      )
      .orderBy(
        desc(comicProgressSchema.comicBookProgress.updatedAt),
      )) as IssueRow[];

    this.logger.log(
      `[comics-opds-svc] buildOnDeckFeed bookCount=${books.length} userId=${userId}`,
    );
    return this.buildAcquisitionFeed({
      id: `${baseUrl}/on-deck`,
      title: 'On Deck',
      baseUrl,
      books,
      userId,
    });
  }

  async buildRecentFeed(baseUrl: string, userId: string): Promise<string> {
    this.logger.log(`[comics-opds-svc] buildRecentFeed userId=${userId}`);
    const books = (await this.db
      .select(this.issueColumns())
      .from(schema.comicBooks)
      .innerJoin(
        schema.comicSeries,
        eq(schema.comicBooks.seriesId, schema.comicSeries.id),
      )
      .where(
        and(
          eq(schema.comicBooks.status, 'available'),
          this.blacklistFilter(userId),
        ),
      )
      .orderBy(desc(schema.comicBooks.createdAt))
      .limit(50)) as IssueRow[];

    this.logger.log(
      `[comics-opds-svc] buildRecentFeed bookCount=${books.length} userId=${userId}`,
    );
    return this.buildAcquisitionFeed({
      id: `${baseUrl}/recent`,
      title: 'Recently Added',
      baseUrl,
      books,
      userId,
    });
  }

  // --- helpers ---

  private issueColumns() {
    return {
      id: schema.comicBooks.id,
      seriesId: schema.comicBooks.seriesId,
      title: schema.comicBooks.title,
      number: schema.comicBooks.number,
      summary: schema.comicBooks.summary,
      coverDate: schema.comicBooks.coverDate,
      coverUrl: schema.comicBooks.coverUrl,
      coverSource: schema.comicBooks.coverSource,
      pageCount: schema.comicBooks.pageCount,
      container: schema.comicBooks.container,
      language: schema.comicBooks.language,
      updatedAt: schema.comicBooks.updatedAt,
    };
  }

  private navFeed(
    baseUrl: string,
    selfId: string,
    title: string,
    entries: string,
    upLink?: string,
  ): string {
    const e = (s: string) => this.escapeXml(s);
    const updated = new Date().toISOString();
    const up = upLink ?? baseUrl;
    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${e(selfId)}</id>
  <title>${e(title)}</title>
  <updated>${updated}</updated>
  <link rel="self" href="${e(selfId)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${e(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${e(up)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entries}
</feed>`;
  }
}
