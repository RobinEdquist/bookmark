import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { api } from '../helpers/api.helper';
import {
  acquireOpdsSettingsLock,
  OPDS_SETTINGS_WAIT_TIMEOUT,
} from '../helpers/opds-settings-lock';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => name === 'entry' || name === 'link',
});

/** Exercises the search predicates against PostgreSQL and the guarded HTTP routes. */
describe('OPDS search (e2e)', () => {
  let db: Pool;
  let admin: TestUser;
  let releaseOpdsSettings: (() => Promise<void>) | undefined;
  let authorization: string;
  let keyId: string;
  let apiKey: string;
  let wasEnabled = false;
  const token = `OPDS-${randomUUID()} & café <`;
  const ebookIds = Array.from({ length: 24 }, () => randomUUID());
  const bookIds = Array.from({ length: 24 }, () => randomUUID());
  const seriesIds = Array.from({ length: 3 }, () => randomUUID());
  const personIds = [randomUUID(), randomUUID()];
  const ebookSeriesId = randomUUID();
  const tagId = randomUUID();

  beforeAll(async () => {
    admin = await getSharedAdmin();
    releaseOpdsSettings = await acquireOpdsSettingsLock();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    wasEnabled = (await api.get('/settings', admin.cookie)).data.opdsEnabled;
    const enabled = await api.patch(
      '/settings',
      { opdsEnabled: true },
      admin.cookie,
    );
    expect(enabled.status).toBe(200);
    const key = await api.post<{ id: string; key: string }>(
      '/api-keys',
      { name: 'OPDS search test' },
      admin.cookie,
    );
    expect(key.status).toBe(201);
    keyId = key.data.id;
    apiKey = key.data.key;
    authorization = `Basic ${Buffer.from(`opds:${key.data.key}`).toString('base64')}`;
    for (const id of personIds) {
      await db.query('INSERT INTO people (id, name) VALUES ($1, $2)', [
        id,
        `${token} creator ${id}`,
      ]);
    }
    await db.query('INSERT INTO series (id, name) VALUES ($1, $2)', [
      ebookSeriesId,
      `${token} saga`,
    ]);
    await db.query('INSERT INTO tags (id, name) VALUES ($1, $2)', [
      tagId,
      token,
    ]);
    await db.query(
      'INSERT INTO user_blacklisted_tags (user_id, tag_id) VALUES ($1, $2)',
      [admin.id, tagId],
    );
    for (const [i, id] of seriesIds.entries()) {
      await db.query(
        'INSERT INTO comic_series (id, title, publisher, status) VALUES ($1, $2, $3, $4)',
        [
          id,
          `${token} volume`,
          `${token} publisher`,
          i === 1 ? 'hidden' : 'available',
        ],
      );
    }
    await db.query(
      'INSERT INTO comic_series_tags (series_id, tag_id) VALUES ($1, $2)',
      [seriesIds[2], tagId],
    );
    for (let i = 0; i < 24; i++) {
      const status = i === 21 ? 'missing' : i === 22 ? 'hidden' : 'available';
      await db.query(
        `INSERT INTO ebooks (id, title, subtitle, file_path, file_name, size_bytes, status, format)
         VALUES ($1, $2, $3, $4, $4, 10, $5, $6)`,
        [
          ebookIds[i],
          `${token} ${String(i).padStart(2, '0')}`,
          `${token} subtitle`,
          `${ebookIds[i]}.epub`,
          status,
          i === 0 ? 'pdf' : 'epub',
        ],
      );
      await db.query(
        `INSERT INTO comic_books (id, series_id, title, sort_number, file_path, file_name, size_bytes, container, status)
         VALUES ($1, $2, $3, $4, $5, $5, 10, 'cbz', $6)`,
        [
          bookIds[i],
          seriesIds[i === 22 ? 1 : i === 23 ? 2 : 0],
          `${token} issue ${i}`,
          i,
          `${bookIds[i]}.cbz`,
          i === 21 ? 'missing' : 'available',
        ],
      );
    }
    await db.query(
      'INSERT INTO ebook_tags (ebook_id, tag_id) VALUES ($1, $2)',
      [ebookIds[23], tagId],
    );
    for (const id of personIds) {
      await db.query(
        'INSERT INTO ebook_authors (ebook_id, person_id) VALUES ($1, $2)',
        [ebookIds[0], id],
      );
      await db.query(
        "INSERT INTO comic_book_creators (book_id, person_id, role) VALUES ($1, $2, 'writer')",
        [bookIds[0], id],
      );
    }
    await db.query(
      'INSERT INTO ebook_series (ebook_id, series_id, "order") VALUES ($1, $2, 1)',
      [ebookIds[0], ebookSeriesId],
    );
  }, OPDS_SETTINGS_WAIT_TIMEOUT);

  afterAll(async () => {
    try {
      if (keyId) await api.delete(`/api-keys/${keyId}`, admin.cookie);
      if (db) {
        await db.query('DELETE FROM ebooks WHERE id = ANY($1::uuid[])', [
          ebookIds,
        ]);
        await db.query('DELETE FROM comic_series WHERE id = ANY($1::uuid[])', [
          seriesIds,
        ]);
        await db.query('DELETE FROM people WHERE id = ANY($1::uuid[])', [
          personIds,
        ]);
        await db.query('DELETE FROM series WHERE id = $1', [ebookSeriesId]);
        await db.query('DELETE FROM tags WHERE id = $1', [tagId]);
        await db.end();
      }
      if (!wasEnabled && admin && releaseOpdsSettings)
        await api.patch('/settings', { opdsEnabled: false }, admin.cookie);
    } finally {
      await releaseOpdsSettings?.();
    }
  });

  async function fetchXml(
    path: string,
    auth: string | undefined = authorization,
  ) {
    const response = await fetch(`${process.env.TEST_BASE_URL}/api${path}`, {
      headers: auth ? { Authorization: auth } : {},
    });
    const body = await response.text();
    return { response, body };
  }

  describe.each(['ebooks', 'comics'])('%s catalog', (catalog) => {
    const base = `/${catalog}/opds`;
    const ids = catalog === 'ebooks' ? ebookIds : bookIds;
    const search = (q: string, page = 1) =>
      `${base}/search?${new URLSearchParams({ q, page: String(page) })}`;

    it('advertises a valid OpenSearch description with the acquisition template', async () => {
      const root = await fetchXml(base);
      const discovery = parser
        .parse(root.body)
        .feed.link.find((l: { rel: string }) => l.rel === 'search');
      expect(discovery.type).toBe('application/opensearchdescription+xml');
      const { response, body } = await fetchXml(`${base}/search.xml`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'application/opensearchdescription+xml',
      );
      expect(XMLValidator.validate(body)).toBe(true);
      const description = parser.parse(body).OpenSearchDescription;
      expect(discovery.href).toBe(
        `${process.env.TEST_BASE_URL}/api${base}/search.xml`,
      );
      expect(description.Url.template).toBe(
        `${process.env.TEST_BASE_URL}/api${base}/search?q={searchTerms}`,
      );
      expect(description.Url.type).toContain('kind=acquisition');
      expect(description.Url.pageOffset).toBeUndefined();

      // Readers substitute searchTerms and follow Atom links for pagination.
      const searchUrl = description.Url.template.replace(
        '{searchTerms}',
        encodeURIComponent(token),
      );
      const first = await fetch(searchUrl, {
        headers: { Authorization: authorization },
      });
      expect(first.status).toBe(200);
      const firstXml = await first.text();
      expect(XMLValidator.validate(firstXml)).toBe(true);
      const feed = parser.parse(firstXml).feed;
      expect(feed.entry).toHaveLength(20);
      const nextUrl = feed.link.find(
        (link: { rel: string }) => link.rel === 'next',
      ).href;
      expect(new URL(nextUrl).searchParams.get('q')).toBe(token);
      expect(new URL(nextUrl).searchParams.get('page')).toBe('2');
      const next = await fetch(nextUrl, {
        headers: { Authorization: authorization },
      });
      expect(next.status).toBe(200);
      expect(parser.parse(await next.text()).feed.entry).toHaveLength(1);
    });

    it('paginates visible results and preserves special characters in all navigation links', async () => {
      const first = await fetchXml(search(token));
      expect(first.response.status).toBe(200);
      expect(XMLValidator.validate(first.body)).toBe(true);
      const feed = parser.parse(first.body).feed;
      expect(feed.entry).toHaveLength(20);
      const next = feed.link.find((l: { rel: string }) => l.rel === 'next');
      expect(new URL(next.href).searchParams.get('q')).toBe(token);
      const second = await fetch(next.href, {
        headers: { Authorization: authorization },
      });
      expect(second.status).toBe(200);
      const last = parser.parse(await second.text()).feed;
      expect(last.entry).toHaveLength(1);
      expect(last.link.some((l: { rel: string }) => l.rel === 'next')).toBe(
        false,
      );
      expect(
        last.link.find((l: { rel: string }) => l.rel === 'previous').href,
      ).toBe(feed.link.find((l: { rel: string }) => l.rel === 'self').href);
      const resultIds = [...feed.entry, ...last.entry].map(
        (e: { id: string }) => e.id,
      );
      expect(new Set(resultIds)).toEqual(
        new Set(ids.slice(0, 21).map((id) => `urn:uuid:${id}`)),
      );
      expect(first.body).toContain('http://opds-spec.org/acquisition');
      if (catalog === 'ebooks')
        expect(first.body).toContain('type="application/pdf"');
    });

    it.each(
      catalog === 'ebooks'
        ? ['subtitle', 'creator', 'saga']
        : ['volume', 'publisher', 'creator'],
    )('matches %s case-insensitively without duplicates', async (field) => {
      const { response, body } = await fetchXml(
        search(`${token} ${field}`.toUpperCase()),
      );
      expect(response.status).toBe(200);
      const entries = parser.parse(body).feed.entry;
      expect(entries.map((e: { id: string }) => e.id)).toContain(
        `urn:uuid:${ids[0]}`,
      );
      expect(new Set(entries.map((e: { id: string }) => e.id)).size).toBe(
        entries.length,
      );
      if (field === 'creator' || field === 'saga')
        expect(entries).toHaveLength(1);
    });

    it.each(['', '   ', `no-match-${randomUUID()}`])(
      'returns an empty valid acquisition feed for %j',
      async (q) => {
        const { response, body } = await fetchXml(search(q));
        expect(response.status).toBe(200);
        expect(XMLValidator.validate(body)).toBe(true);
        expect(parser.parse(body).feed.entry).toBeUndefined();
      },
    );

    it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
      'rejects invalid page %s',
      async (page) => {
        expect(
          (await fetchXml(`${base}/search?q=test&page=${page}`)).response
            .status,
        ).toBe(400);
      },
    );

    it.each(['search', 'search.xml'])(
      'also accepts a Bearer API key for %s',
      async (path) => {
        const { response } = await fetchXml(
          `${base}/${path}`,
          `Bearer ${apiKey}`,
        );
        expect(response.status).toBe(200);
      },
    );

    it('defaults an omitted page to the first page', async () => {
      const { response, body } = await fetchXml(
        `${base}/search?${new URLSearchParams({ q: token })}`,
      );
      expect(response.status).toBe(200);
      const feed = parser.parse(body).feed;
      expect(feed.entry).toHaveLength(20);
      expect(
        new URL(
          feed.link.find((l: { rel: string }) => l.rel === 'self').href,
        ).searchParams.get('page'),
      ).toBe('1');
    });

    it('returns an empty feed beyond the last page', async () => {
      const { response, body } = await fetchXml(search(token, 3));
      expect(response.status).toBe(200);
      expect(parser.parse(body).feed.entry).toBeUndefined();
    });

    it('rejects repeated search terms', async () => {
      expect(
        (await fetchXml(`${base}/search?q=one&q=two`)).response.status,
      ).toBe(400);
    });

    it.each(['search', 'search.xml'])(
      'requires authentication for %s',
      async (path) => {
        const { response } = await fetchXml(`${base}/${path}`, '');
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toContain('Basic');
      },
    );
  });
});
