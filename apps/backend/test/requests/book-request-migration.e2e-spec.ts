import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  mkdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { bookKey } from '../../src/requests/request-intent';

describe('Book request migration (e2e)', () => {
  it('preserves populated legacy requests, duplicate identities, supporters, and uncertain submissions', async () => {
    // A separate database lets this exercise an actual upgrade without altering
    // the schema shared by other E2E workers.
    const container = await new PostgreSqlContainer('postgres:18').start();
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    const directory = await mkdtemp(
      join(tmpdir(), 'bookmark-request-migration-'),
    );
    try {
      const migrations = resolve(__dirname, '../../drizzle/migrations');
      const journal = JSON.parse(
        await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
      ) as { entries: { idx: number; tag: string }[] };
      await mkdir(join(directory, 'meta'));
      const older = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx < 39),
      };
      await writeFile(
        join(directory, 'meta/_journal.json'),
        JSON.stringify(older),
      );
      for (const entry of older.entries)
        await copyFile(
          join(migrations, `${entry.tag}.sql`),
          join(directory, `${entry.tag}.sql`),
        );
      const db = drizzle(pool);
      await migrate(db, { migrationsFolder: directory });
      const userId = randomUUID();
      await pool.query(
        'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
        [userId, 'Migration user', `${userId}@test.com`],
      );
      const statuses = [
        'pending',
        'approved',
        'downloading',
        'complete',
        'rejected',
      ];
      const ids = statuses.map(() => randomUUID());
      const libraryId = randomUUID();
      for (const [i, status] of statuses.entries()) {
        await pool.query(
          'INSERT INTO requests (id, user_id, status, torrent_id, torrent_hash, folder_name, title, author, content_type, category_id, library_item_id, library_item_type, auto_approved_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
          [
            ids[i],
            userId,
            status,
            String(i + 1),
            status === 'downloading' || status === 'complete'
              ? `hash_${i}`
              : null,
            `folder_${i}`,
            '  Same   Title  ',
            'An AUTHOR',
            'audiobook',
            13,
            status === 'complete' ? libraryId : null,
            status === 'complete' ? 'audiobook' : null,
            status === 'downloading' ? userId : null,
          ],
        );
      }
      await pool.query(
        'INSERT INTO request_supporters (request_id, user_id) VALUES ($1, $2)',
        [ids[1], userId],
      );
      const before = (
        await pool.query('SELECT * FROM requests ORDER BY torrent_id')
      ).rows as Record<string, unknown>[];
      const supporters = (await pool.query('SELECT * FROM request_supporters'))
        .rows;
      await migrate(db, { migrationsFolder: migrations });
      const after = (
        await pool.query('SELECT * FROM requests ORDER BY torrent_id')
      ).rows as Record<string, unknown>[];
      expect(after).toHaveLength(before.length);
      for (const [index, row] of after.entries()) {
        for (const [key, value] of Object.entries(before[index]))
          expect(row[key]).toEqual(value);
        expect(row.book_key).toBe(bookKey('  Same   Title  ', 'An AUTHOR'));
        expect(row.language_key).toBe('any');
      }
      expect(
        (await pool.query('SELECT * FROM request_supporters')).rows,
      ).toEqual(supporters);
      expect(
        (
          await pool.query(
            'SELECT status, torrent_hash FROM request_attempts ORDER BY torrent_id',
          )
        ).rows,
      ).toEqual([
        { status: 'uncertain', torrent_hash: null },
        { status: 'tracking', torrent_hash: 'hash_2' },
        { status: 'complete', torrent_hash: 'hash_3' },
      ]);
      // Re-running migrations must not duplicate the preserved attempts.
      await migrate(db, { migrationsFolder: migrations });
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM request_attempts',
          )
        ).rows[0].count,
      ).toBe(3);
    } finally {
      await pool.end();
      await container.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
