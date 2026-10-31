import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

/**
 * A comic edit locks only the fields it sends. The validation pipe builds DTO
 * instances whose unset fields are undefined own properties, and counting
 * those used to lock every field against ComicVine.
 */
describe('Comic edits lock only the fields sent (e2e)', () => {
  let db: Pool;
  let admin: TestUser;
  let seriesId: string;
  const bookId = randomUUID();

  async function bookManualFields() {
    const response = await api.get<{ manualFields: string[] }>(
      `/comics/books/${bookId}`,
      admin.cookie,
    );
    expect(response.status).toBe(200);
    return response.data.manualFields;
  }

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const series = await api.post<{ id: string }>(
      '/comics/series',
      { title: `Manual fields ${bookId.slice(0, 8)}` },
      admin.cookie,
    );
    expect(series.status).toBe(201);
    seriesId = series.data.id;
    await db.query(
      `INSERT INTO comic_books (id, series_id, file_path, file_name, size_bytes, container)
       VALUES ($1, $2, $3, $4, 10, 'cbz')`,
      [bookId, seriesId, `${bookId}.cbz`, `${bookId}.cbz`],
    );
  });

  afterAll(async () => {
    if (!db) return;
    if (seriesId) {
      await db.query('DELETE FROM comic_series WHERE id = $1', [seriesId]);
    }
    await db.end();
  });

  it('PATCH /comics/series/:id locks only the sent field', async () => {
    const response = await api.patch(
      `/comics/series/${seriesId}`,
      { publisher: 'Marvel' },
      admin.cookie,
    );
    expect(response.status).toBe(200);
    const detail = await api.get<{ manualFields: string[] }>(
      `/comics/series/${seriesId}`,
      admin.cookie,
    );
    expect(detail.data.manualFields).toEqual(['publisher']);
  });

  it('PATCH /comics/books/:id locks only the sent field', async () => {
    const response = await api.patch(
      `/comics/books/${bookId}`,
      { title: 'Weapon X' },
      admin.cookie,
    );
    expect(response.status).toBe(200);
    expect(await bookManualFields()).toEqual(['title']);
  });

  it('PATCH /comics/books/batch locks only the sent field and skips an empty batch', async () => {
    const empty = await api.patch<{ updated: number }>(
      '/comics/books/batch',
      { ids: [bookId], data: {} },
      admin.cookie,
    );
    expect(empty.status).toBe(200);
    expect(empty.data.updated).toBe(0);

    const response = await api.patch<{ updated: number }>(
      '/comics/books/batch',
      { ids: [bookId], data: { format: 'tpb' } },
      admin.cookie,
    );
    expect(response.status).toBe(200);
    expect(response.data.updated).toBe(1);
    expect((await bookManualFields()).sort()).toEqual(['format', 'title']);
  });
});
