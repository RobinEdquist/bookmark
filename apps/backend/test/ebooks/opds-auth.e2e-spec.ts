import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { acquireOpdsSettingsLock } from '../helpers/opds-settings-lock';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

/**
 * OPDS readers differ in what they can send: some only do HTTP Basic, others
 * only a Bearer token. Both must reach the same feeds with the same API key,
 * on the ebook and comic catalogs alike — so exercise both against the real
 * server rather than trusting the Swagger annotations.
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const FEEDS = ['/ebooks/opds', '/ebooks/opds/groups', '/comics/opds'] as const;

async function fetchFeed(path: string, authorization?: string) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  return { status: response.status, body: await response.text(), response };
}

function basicHeader(key: string): string {
  return `Basic ${Buffer.from(`opds:${key}`).toString('base64')}`;
}

describe('OPDS authentication schemes (e2e)', () => {
  let admin: TestUser;
  let releaseOpdsSettings: (() => Promise<void>) | undefined;
  let apiKey: string;
  let keyId: string;
  let opdsWasEnabled = false;

  beforeAll(async () => {
    admin = await getSharedAdmin();
    releaseOpdsSettings = await acquireOpdsSettingsLock();

    const settings = await api.get('/settings', admin.cookie);
    opdsWasEnabled = settings.data?.opdsEnabled === true;
    if (!opdsWasEnabled) {
      const enabled = await api.patch(
        '/settings',
        { opdsEnabled: true },
        admin.cookie,
      );
      expect(enabled.status).toBe(200);
    }

    const created = await api.post<{ id: string; key: string }>(
      '/api-keys',
      { name: 'OPDS scheme test' },
      admin.cookie,
    );
    expect(created.status).toBe(201);
    apiKey = created.data.key;
    keyId = created.data.id;
    expect(apiKey).toMatch(/^bkmrk_/);
  });

  afterAll(async () => {
    try {
      if (keyId) await api.delete(`/api-keys/${keyId}`, admin.cookie);
      if (!opdsWasEnabled && releaseOpdsSettings) {
        await api.patch('/settings', { opdsEnabled: false }, admin.cookie);
      }
    } finally {
      await releaseOpdsSettings?.();
    }
  });

  describe.each(FEEDS)('%s', (path) => {
    it('accepts a Bearer API key', async () => {
      const { status, body } = await fetchFeed(path, `Bearer ${apiKey}`);
      expect(status).toBe(200);
      expect(body).toContain('<feed');
    });

    it('accepts HTTP Basic with the API key as the password', async () => {
      const { status, body } = await fetchFeed(path, basicHeader(apiKey));
      expect(status).toBe(200);
      expect(body).toContain('<feed');
    });

    it('challenges with Basic when credentials are missing', async () => {
      const { status, response } = await fetchFeed(path);
      expect(status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Basic');
    });

    it('rejects a bad key in either scheme', async () => {
      const bogus = 'bkmrk_not_a_real_key';
      expect((await fetchFeed(path, `Bearer ${bogus}`)).status).toBe(401);
      expect((await fetchFeed(path, basicHeader(bogus))).status).toBe(401);
    });
  });

  /**
   * Byte-comparing two responses only means something against a feed no other
   * worker can move underneath it — the shared catalogs above are mutated
   * concurrently by the other E2E suites. So this owns its group and its ebook.
   */
  describe('feed content is identical under either scheme', () => {
    let db: Pool;
    let groupId: string;
    const ebookId = randomUUID();

    beforeAll(async () => {
      db = new Pool({ connectionString: process.env.DATABASE_URL });
      await db.query(
        `INSERT INTO ebooks (id, title, file_path, file_name, size_bytes, status)
         VALUES ($1, $2, $3, $4, 10, 'available')`,
        [ebookId, 'OPDS scheme fixture', `${ebookId}.epub`, `${ebookId}.epub`],
      );

      const group = await api.post<{ id: string }>(
        '/ebooks/groups',
        { name: `OPDS scheme fixture ${ebookId}` },
        admin.cookie,
      );
      expect(group.status).toBe(201);
      groupId = group.data.id;

      const member = await api.post(
        `/ebooks/groups/${groupId}/ebooks`,
        { ebookId, role: 'Scenario' },
        admin.cookie,
      );
      expect(member.status).toBe(200);
    });

    afterAll(async () => {
      if (db) {
        if (groupId) {
          await db.query('DELETE FROM ebook_groups WHERE id = $1', [groupId]);
        }
        await db.query('DELETE FROM ebooks WHERE id = $1', [ebookId]);
        await db.end();
      }
    });

    it('serves the same group acquisition feed to Bearer and Basic', async () => {
      const path = `/ebooks/opds/groups/${groupId}`;
      const [bearer, basic] = await Promise.all([
        fetchFeed(path, `Bearer ${apiKey}`),
        fetchFeed(path, basicHeader(apiKey)),
      ]);

      expect(bearer.status).toBe(200);
      expect(basic.status).toBe(200);
      // The feed-level <updated> is stamped per request; entry data is not.
      const strip = (xml: string) =>
        xml.replace(/<updated>[^<]*<\/updated>/g, '');
      expect(strip(bearer.body)).toBe(strip(basic.body));
      expect(bearer.body).toContain('OPDS scheme fixture');
      expect(bearer.body).toContain('<summary>Scenario</summary>');
    });
  });
});
