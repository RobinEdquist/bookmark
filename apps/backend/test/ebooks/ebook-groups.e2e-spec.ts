import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

/** Real PostgreSQL and HTTP regression coverage for serialized membership writes. */
describe('Ebook group membership concurrency (e2e)', () => {
  let db: Pool;
  let admin: TestUser;
  let groupId: string;
  const ebookIds: string[] = Array.from({ length: 8 }, () => randomUUID());

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    for (const [i, id] of ebookIds.entries()) {
      await db.query(
        'INSERT INTO ebooks (id, title, file_path, file_name, size_bytes) VALUES ($1, $2, $3, $4, 10)',
        [id, `Group concurrency book ${i}`, `${id}.epub`, `${id}.epub`],
      );
    }
  });
  beforeEach(async () => {
    const response = await api.post<{ id: string }>(
      '/ebooks/groups',
      { name: 'Concurrency regression' },
      admin.cookie,
    );
    expect(response.status).toBe(201);
    groupId = response.data.id;
  });
  afterEach(async () => {
    if (groupId)
      await db.query('DELETE FROM ebook_groups WHERE id = $1', [groupId]);
  });
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM ebooks WHERE id = ANY($1::uuid[])', [
        ebookIds,
      ]);
      await db.end();
    }
  });

  async function add(ids: string[]) {
    const responses = await Promise.all(
      ids.map((ebookId) =>
        api.post(`/ebooks/groups/${groupId}/ebooks`, { ebookId }, admin.cookie),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(ids.map(() => 200));
  }
  async function members() {
    return (
      await db.query<{ ebook_id: string; position: number }>(
        'SELECT ebook_id, position FROM ebook_group_members WHERE group_id = $1 ORDER BY position',
        [groupId],
      )
    ).rows;
  }

  /**
   * `/ebooks/groups` only wins over EbooksController's catch-all `@Get(':id')`
   * because EbookGroupsController is registered first in ebooks.module.ts.
   * Reordering that array makes this list resolve as an ebook lookup instead.
   */
  it('routes the collection path to the group list, not the ebook lookup', async () => {
    const response = await api.get<{
      groups: { id: string; name: string }[];
      total: number;
    }>('/ebooks/groups', admin.cookie);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.groups)).toBe(true);
    expect(response.data.groups.some((g) => g.id === groupId)).toBe(true);
  });

  it('assigns distinct consecutive positions to simultaneous additions', async () => {
    await add(ebookIds);
    expect((await members()).map((m) => m.position)).toEqual(
      ebookIds.map((_, i) => i),
    );
  });

  it('keeps simultaneous additions of the same ebook idempotent', async () => {
    await add(ebookIds.map(() => ebookIds[0]));
    expect(await members()).toEqual([{ ebook_id: ebookIds[0], position: 0 }]);
  });

  it('serializes conflicting reorder requests without deadlocks or mixed orders', async () => {
    await add(ebookIds);
    const reversed = [...ebookIds].reverse();
    const requests = Array.from({ length: 6 }, (_, i) =>
      i % 2 ? reversed : ebookIds,
    );
    const responses = await Promise.all(
      requests.map((order) =>
        api.patch(
          `/ebooks/groups/${groupId}/order`,
          { ebookIds: order },
          admin.cookie,
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(requests.map(() => 200));
    const rows = await members();
    expect(rows.map((m) => m.position)).toEqual(ebookIds.map((_, i) => i));
    expect([ebookIds, reversed]).toContainEqual(rows.map((m) => m.ebook_id));
  });

  it('preserves concurrently added and omitted members during reordering', async () => {
    const initial = ebookIds.slice(0, 5);
    await add(initial);
    const reordered = [initial[3], initial[1], initial[0]];
    const [, response] = await Promise.all([
      add(ebookIds.slice(5)),
      api.patch(
        `/ebooks/groups/${groupId}/order`,
        { ebookIds: reordered },
        admin.cookie,
      ),
    ]);
    expect(response.status).toBe(200);
    const rows = await members();
    expect(rows).toHaveLength(ebookIds.length);
    expect(new Set(rows.map((m) => m.position)).size).toBe(ebookIds.length);
    expect(
      rows.filter((m) => reordered.includes(m.ebook_id)).map((m) => m.ebook_id),
    ).toEqual(reordered);
  });
});
