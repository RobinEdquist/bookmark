import { api } from '../helpers/api.helper';
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

describe('OPDS authentication schemes (e2e)', () => {
  let admin: TestUser;
  let apiKey: string;
  let keyId: string;
  let opdsWasEnabled = false;

  beforeAll(async () => {
    admin = await getSharedAdmin();

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
    if (keyId) await api.delete(`/api-keys/${keyId}`, admin.cookie);
    if (!opdsWasEnabled) {
      await api.patch('/settings', { opdsEnabled: false }, admin.cookie);
    }
  });

  describe.each(FEEDS)('%s', (path) => {
    it('accepts a Bearer API key', async () => {
      const { status, body } = await fetchFeed(path, `Bearer ${apiKey}`);
      expect(status).toBe(200);
      expect(body).toContain('<feed');
    });

    it('accepts HTTP Basic with the API key as the password', async () => {
      const basic = Buffer.from(`opds:${apiKey}`).toString('base64');
      const { status, body } = await fetchFeed(path, `Basic ${basic}`);
      expect(status).toBe(200);
      expect(body).toContain('<feed');
    });

    it('returns the same feed either way', async () => {
      const basic = Buffer.from(`opds:${apiKey}`).toString('base64');
      const [bearer, basicAuth] = await Promise.all([
        fetchFeed(path, `Bearer ${apiKey}`),
        fetchFeed(path, `Basic ${basic}`),
      ]);
      // <updated> is stamped per request, so compare everything else.
      const strip = (xml: string) =>
        xml.replace(/<updated>[^<]*<\/updated>/g, '');
      expect(strip(bearer.body)).toBe(strip(basicAuth.body));
    });

    it('challenges with Basic when credentials are missing', async () => {
      const { status, response } = await fetchFeed(path);
      expect(status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('Basic');
    });

    it('rejects a bad key in either scheme', async () => {
      const bogus = 'bkmrk_not_a_real_key';
      const basic = Buffer.from(`opds:${bogus}`).toString('base64');
      expect((await fetchFeed(path, `Bearer ${bogus}`)).status).toBe(401);
      expect((await fetchFeed(path, `Basic ${basic}`)).status).toBe(401);
    });
  });
});
