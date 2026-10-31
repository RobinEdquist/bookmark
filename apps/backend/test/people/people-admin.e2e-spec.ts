import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { api } from '../helpers/api.helper';
import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';

interface Credit {
  book_id: string;
  role: string;
  order: number;
}

/**
 * comic_book_creators cascades on person delete, so merge and split must move
 * a person's comic credits before they delete that person.
 */
describe('People admin comic credits (e2e)', () => {
  let db: Pool;
  let admin: TestUser;
  // Every person this suite creates carries the tag in its name, so cleanup
  // also catches the people split creates.
  const tag = randomUUID();
  const seriesId = randomUUID();
  const bookIds = [randomUUID(), randomUUID()];

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    await db.query('INSERT INTO comic_series (id, title) VALUES ($1, $2)', [
      seriesId,
      `People admin series ${tag}`,
    ]);
    for (const [i, id] of bookIds.entries()) {
      await db.query(
        `INSERT INTO comic_books (id, series_id, number, file_path, file_name, size_bytes, container)
         VALUES ($1, $2, $3, $4, $5, 10, 'cbz')`,
        [id, seriesId, String(i + 1), `${id}.cbz`, `${id}.cbz`],
      );
    }
  });
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM comic_series WHERE id = $1', [seriesId]);
      await db.query('DELETE FROM people WHERE name LIKE $1', [`%${tag}`]);
      await db.end();
    }
  });

  async function createPerson(label: string) {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO people (name) VALUES ($1) RETURNING id',
      [`${label} ${tag}`],
    );
    return rows[0].id;
  }
  async function addCredit(personId: string, credit: Credit) {
    await db.query(
      'INSERT INTO comic_book_creators (book_id, person_id, role, "order") VALUES ($1, $2, $3, $4)',
      [credit.book_id, personId, credit.role, credit.order],
    );
  }
  async function creditsOf(personId: string) {
    return (
      await db.query<Credit>(
        'SELECT book_id, role::text AS role, "order" FROM comic_book_creators WHERE person_id = $1',
        [personId],
      )
    ).rows;
  }

  it('moves comic credits to the target and keeps the target row on a duplicate', async () => {
    const sourceId = await createPerson('Merge source');
    const targetId = await createPerson('Merge target');
    const moved: Credit[] = [
      { book_id: bookIds[0], role: 'writer', order: 1 },
      { book_id: bookIds[0], role: 'penciller', order: 2 },
      { book_id: bookIds[1], role: 'inker', order: 1 },
    ];
    for (const credit of moved) await addCredit(sourceId, credit);
    await addCredit(sourceId, {
      book_id: bookIds[1],
      role: 'writer',
      order: 0,
    });
    const kept: Credit = { book_id: bookIds[1], role: 'writer', order: 3 };
    await addCredit(targetId, kept);

    const response = await api.post<{ comicCreatorLinksMerged: number }>(
      `/admin/people/${sourceId}/merge/${targetId}`,
      undefined,
      admin.cookie,
    );

    expect(response.status).toBe(201);
    expect(response.data.comicCreatorLinksMerged).toBe(4);
    const credits = await creditsOf(targetId);
    expect(credits).toHaveLength(4);
    expect(credits).toEqual(expect.arrayContaining([...moved, kept]));
    const { rowCount } = await db.query('SELECT 1 FROM people WHERE id = $1', [
      sourceId,
    ]);
    expect(rowCount).toBe(0);
  });

  it('gives each replacement person the comic credits of the split person', async () => {
    const sourceId = await createPerson('Split source');
    const credits: Credit[] = [
      { book_id: bookIds[0], role: 'writer', order: 0 },
      { book_id: bookIds[1], role: 'colorist', order: 2 },
    ];
    for (const credit of credits) await addCredit(sourceId, credit);
    const names = [`Split one ${tag}`, `Split two ${tag}`];

    const response = await api.post<{ comicCreatorLinksSplit: number }>(
      `/admin/people/${sourceId}/split`,
      { names },
      admin.cookie,
    );

    expect(response.status).toBe(201);
    expect(response.data.comicCreatorLinksSplit).toBe(2);
    for (const name of names) {
      const { rows } = await db.query<{ id: string }>(
        'SELECT id FROM people WHERE name = $1',
        [name],
      );
      expect(rows).toHaveLength(1);
      const personCredits = await creditsOf(rows[0].id);
      expect(personCredits).toHaveLength(credits.length);
      expect(personCredits).toEqual(expect.arrayContaining(credits));
    }
  });
});
