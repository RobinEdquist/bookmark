import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobookSchema from '../audiobooks/schema';

@Injectable()
export class OpdsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private truncateDescription(description: string | null, maxLength = 500): string | null {
    if (!description) return null;
    // Strip HTML tags
    const text = description.replace(/<[^>]*>/g, '');
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  async buildRootCatalog(baseUrl: string): Promise<string> {
    const updated = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${this.escapeXml(baseUrl)}</id>
  <title>Ebook Library</title>
  <updated>${updated}</updated>
  <link rel="self" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>

  <entry>
    <id>${this.escapeXml(baseUrl)}/all</id>
    <title>All Ebooks</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${this.escapeXml(baseUrl)}/all" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">Browse all ebooks in the library</content>
  </entry>

  <entry>
    <id>${this.escapeXml(baseUrl)}/authors</id>
    <title>By Author</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${this.escapeXml(baseUrl)}/authors" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
    <content type="text">Browse ebooks by author</content>
  </entry>

  <entry>
    <id>${this.escapeXml(baseUrl)}/series</id>
    <title>By Series</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${this.escapeXml(baseUrl)}/series" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
    <content type="text">Browse ebooks by series</content>
  </entry>
</feed>`;
  }

  async buildAllEbooksFeed(baseUrl: string, page: number = 1, perPage: number = 20): Promise<string> {
    const offset = (page - 1) * perPage;

    // Get total count
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.status, 'available'));

    // Get ebooks
    const ebooks = await this.db
      .select()
      .from(schema.ebooks)
      .where(eq(schema.ebooks.status, 'available'))
      .orderBy(asc(schema.ebooks.title))
      .limit(perPage)
      .offset(offset);

    const entries = await this.buildEbookEntries(ebooks, baseUrl);
    const totalPages = Math.ceil(total / perPage);

    return this.buildAcquisitionFeed({
      id: `${baseUrl}/all`,
      title: 'All Ebooks',
      baseUrl,
      entries,
      page,
      totalPages,
      feedPath: '/all',
    });
  }

  async buildAuthorsNavigationFeed(baseUrl: string): Promise<string> {
    // Get authors with ebook counts
    const authors = await this.db
      .select({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
        count: count(schema.ebookAuthors.ebookId),
      })
      .from(audiobookSchema.people)
      .innerJoin(schema.ebookAuthors, eq(audiobookSchema.people.id, schema.ebookAuthors.personId))
      .innerJoin(schema.ebooks, eq(schema.ebookAuthors.ebookId, schema.ebooks.id))
      .where(eq(schema.ebooks.status, 'available'))
      .groupBy(audiobookSchema.people.id, audiobookSchema.people.name)
      .orderBy(asc(audiobookSchema.people.name));

    const updated = new Date().toISOString();
    const entries = authors
      .map(
        (author) => `
  <entry>
    <id>${this.escapeXml(baseUrl)}/authors/${author.id}</id>
    <title>${this.escapeXml(author.name)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${this.escapeXml(baseUrl)}/authors/${author.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">${author.count} ebook${author.count !== 1 ? 's' : ''}</content>
  </entry>`,
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${this.escapeXml(baseUrl)}/authors</id>
  <title>Authors</title>
  <updated>${updated}</updated>
  <link rel="self" href="${this.escapeXml(baseUrl)}/authors" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entries}
</feed>`;
  }

  async buildAuthorFeed(baseUrl: string, authorId: string): Promise<string> {
    // Get author info
    const [author] = await this.db
      .select()
      .from(audiobookSchema.people)
      .where(eq(audiobookSchema.people.id, authorId))
      .limit(1);

    if (!author) {
      throw new Error('Author not found');
    }

    // Get ebooks by this author
    const ebookIds = await this.db
      .select({ ebookId: schema.ebookAuthors.ebookId })
      .from(schema.ebookAuthors)
      .where(eq(schema.ebookAuthors.personId, authorId));

    const ebooks = await this.db
      .select()
      .from(schema.ebooks)
      .where(
        eq(schema.ebooks.status, 'available'),
      )
      .orderBy(asc(schema.ebooks.title));

    // Filter to only include ebooks by this author
    const authorEbooks = ebooks.filter((eb) =>
      ebookIds.some((e) => e.ebookId === eb.id),
    );

    const entries = await this.buildEbookEntries(authorEbooks, baseUrl);

    return this.buildAcquisitionFeed({
      id: `${baseUrl}/authors/${authorId}`,
      title: author.name,
      baseUrl,
      entries,
      upLink: `${baseUrl}/authors`,
    });
  }

  async buildSeriesNavigationFeed(baseUrl: string): Promise<string> {
    // Get series with ebook counts
    const seriesList = await this.db
      .select({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
        count: count(schema.ebookSeries.ebookId),
      })
      .from(audiobookSchema.series)
      .innerJoin(schema.ebookSeries, eq(audiobookSchema.series.id, schema.ebookSeries.seriesId))
      .innerJoin(schema.ebooks, eq(schema.ebookSeries.ebookId, schema.ebooks.id))
      .where(eq(schema.ebooks.status, 'available'))
      .groupBy(audiobookSchema.series.id, audiobookSchema.series.name)
      .orderBy(asc(audiobookSchema.series.name));

    const updated = new Date().toISOString();
    const entries = seriesList
      .map(
        (s) => `
  <entry>
    <id>${this.escapeXml(baseUrl)}/series/${s.id}</id>
    <title>${this.escapeXml(s.name)}</title>
    <updated>${updated}</updated>
    <link rel="subsection" href="${this.escapeXml(baseUrl)}/series/${s.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <content type="text">${s.count} ebook${s.count !== 1 ? 's' : ''}</content>
  </entry>`,
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${this.escapeXml(baseUrl)}/series</id>
  <title>Series</title>
  <updated>${updated}</updated>
  <link rel="self" href="${this.escapeXml(baseUrl)}/series" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${entries}
</feed>`;
  }

  async buildSeriesFeed(baseUrl: string, seriesId: string): Promise<string> {
    // Get series info
    const [seriesInfo] = await this.db
      .select()
      .from(audiobookSchema.series)
      .where(eq(audiobookSchema.series.id, seriesId))
      .limit(1);

    if (!seriesInfo) {
      throw new Error('Series not found');
    }

    // Get ebooks in this series, ordered by series position
    const ebooksInSeries = await this.db
      .select({
        ebook: schema.ebooks,
        order: schema.ebookSeries.order,
      })
      .from(schema.ebookSeries)
      .innerJoin(schema.ebooks, eq(schema.ebookSeries.ebookId, schema.ebooks.id))
      .where(eq(schema.ebookSeries.seriesId, seriesId))
      .orderBy(asc(schema.ebookSeries.order));

    const ebooks = ebooksInSeries
      .filter((e) => e.ebook.status === 'available')
      .map((e) => e.ebook);

    const entries = await this.buildEbookEntries(ebooks, baseUrl);

    return this.buildAcquisitionFeed({
      id: `${baseUrl}/series/${seriesId}`,
      title: seriesInfo.name,
      baseUrl,
      entries,
      upLink: `${baseUrl}/series`,
    });
  }

  private async buildEbookEntries(
    ebooks: (typeof schema.ebooks.$inferSelect)[],
    baseUrl: string,
  ): Promise<string> {
    const entries: string[] = [];

    for (const ebook of ebooks) {
      // Get authors for this ebook
      const authors = await this.db
        .select({ name: audiobookSchema.people.name })
        .from(schema.ebookAuthors)
        .innerJoin(audiobookSchema.people, eq(schema.ebookAuthors.personId, audiobookSchema.people.id))
        .where(eq(schema.ebookAuthors.ebookId, ebook.id))
        .orderBy(asc(schema.ebookAuthors.order));

      const authorNames = authors.map((a) => a.name);
      const summary = this.truncateDescription(ebook.description);
      const apiBaseUrl = baseUrl.replace('/opds', '');

      let entry = `
  <entry>
    <id>urn:uuid:${ebook.id}</id>
    <title>${this.escapeXml(ebook.title)}</title>
    <updated>${ebook.updatedAt.toISOString()}</updated>`;

      // Add authors
      for (const name of authorNames) {
        entry += `
    <author><name>${this.escapeXml(name)}</name></author>`;
      }

      // Add summary if available
      if (summary) {
        entry += `
    <summary>${this.escapeXml(summary)}</summary>`;
      }

      // Add published date if available
      if (ebook.publishedDate) {
        entry += `
    <published>${ebook.publishedDate}</published>`;
      }

      // Add language if available
      if (ebook.language) {
        entry += `
    <dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">${this.escapeXml(ebook.language)}</dc:language>`;
      }

      // Add ISBN if available
      if (ebook.isbn) {
        entry += `
    <dc:identifier xmlns:dc="http://purl.org/dc/elements/1.1/">urn:isbn:${this.escapeXml(ebook.isbn)}</dc:identifier>`;
      }

      // Add cover image link if available
      if (ebook.coverUrl || ebook.coverSource) {
        entry += `
    <link rel="http://opds-spec.org/image" href="${this.escapeXml(apiBaseUrl)}/${ebook.id}/cover" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${this.escapeXml(apiBaseUrl)}/${ebook.id}/cover" type="image/jpeg"/>`;
      }

      // Add acquisition link (download)
      entry += `
    <link rel="http://opds-spec.org/acquisition" href="${this.escapeXml(apiBaseUrl)}/${ebook.id}/download" type="application/epub+zip"/>
  </entry>`;

      entries.push(entry);
    }

    return entries.join('');
  }

  private buildAcquisitionFeed(options: {
    id: string;
    title: string;
    baseUrl: string;
    entries: string;
    page?: number;
    totalPages?: number;
    feedPath?: string;
    upLink?: string;
  }): string {
    const { id, title, baseUrl, entries, page, totalPages, feedPath, upLink } = options;
    const updated = new Date().toISOString();

    let paginationLinks = '';
    if (page && totalPages && feedPath) {
      if (page > 1) {
        paginationLinks += `
  <link rel="previous" href="${this.escapeXml(baseUrl)}${feedPath}?page=${page - 1}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>`;
      }
      if (page < totalPages) {
        paginationLinks += `
  <link rel="next" href="${this.escapeXml(baseUrl)}${feedPath}?page=${page + 1}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>`;
      }
    }

    const upLinkXml = upLink
      ? `<link rel="up" href="${this.escapeXml(upLink)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`
      : `<link rel="up" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${this.escapeXml(id)}</id>
  <title>${this.escapeXml(title)}</title>
  <updated>${updated}</updated>
  <link rel="self" href="${this.escapeXml(id)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${this.escapeXml(baseUrl)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  ${upLinkXml}${paginationLinks}
  ${entries}
</feed>`;
  }
}
