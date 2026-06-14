/**
 * Database seed helpers for E2E tests.
 *
 * Inserts audiobooks/ebooks/comics directly into the test database
 * since there are no create API endpoints for these entities.
 */

/* eslint-disable turbo/no-undeclared-env-vars */
import pg from 'pg';

const { Client } = pg;

function getClient(): pg.Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL not set — is global-setup.ts exporting it?',
    );
  }
  return new Client({ connectionString });
}

export interface SeededAudiobook {
  id: string;
  title: string;
}

export interface SeededEbook {
  id: string;
  title: string;
}

export interface SeededComicSeries {
  id: string;
  title: string;
}

export interface SeededComicBook {
  id: string;
  seriesId: string;
}

/**
 * Insert a test audiobook with an author into the database.
 * Returns the audiobook ID for use in navigation.
 */
export async function seedAudiobook(overrides?: {
  title?: string;
  authorName?: string;
  narratorName?: string;
  description?: string;
  duration?: number;
  language?: string;
}): Promise<SeededAudiobook> {
  const client = getClient();
  await client.connect();

  try {
    const title = overrides?.title ?? 'E2E Test Audiobook';
    const authorName = overrides?.authorName ?? 'E2E Test Author';
    const narratorName = overrides?.narratorName ?? 'E2E Test Narrator';
    const description = overrides?.description ?? 'A test audiobook for E2E.';
    const duration = overrides?.duration ?? 3600;
    const language = overrides?.language ?? 'en';

    // Insert audiobook
    const abResult = await client.query(
      `INSERT INTO audiobooks (title, description, duration, language, file_path, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [title, description, duration, language, '/fake/e2e/path', 'available'],
    );
    const audiobookId = abResult.rows[0].id as string;

    // Insert author
    const authorResult = await client.query(
      `INSERT INTO people (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [authorName],
    );
    const authorId = authorResult.rows[0].id as string;

    // Link author to audiobook
    await client.query(
      `INSERT INTO audiobook_authors (audiobook_id, person_id, "order") VALUES ($1, $2, 0)`,
      [audiobookId, authorId],
    );

    // Insert narrator
    const narratorResult = await client.query(
      `INSERT INTO people (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [narratorName],
    );
    const narratorId = narratorResult.rows[0].id as string;

    // Link narrator to audiobook
    await client.query(
      `INSERT INTO audiobook_narrators (audiobook_id, person_id, "order") VALUES ($1, $2, 0)`,
      [audiobookId, narratorId],
    );

    // Insert a dummy audio file so the detail page shows files
    await client.query(
      `INSERT INTO audiobook_files (audiobook_id, file_path, file_name, "order", duration, format, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        audiobookId,
        '/fake/e2e/path/chapter1.mp3',
        'chapter1.mp3',
        1,
        duration,
        'mp3',
        50000000,
      ],
    );

    return { id: audiobookId, title };
  } finally {
    await client.end();
  }
}

/**
 * Insert a test ebook with an author into the database.
 * Returns the ebook ID for use in navigation.
 */
export async function seedEbook(overrides?: {
  title?: string;
  authorName?: string;
  description?: string;
  pageCount?: number;
  language?: string;
  publisher?: string;
  isbn?: string;
}): Promise<SeededEbook> {
  const client = getClient();
  await client.connect();

  try {
    const title = overrides?.title ?? 'E2E Test Ebook';
    const authorName = overrides?.authorName ?? 'E2E Test Ebook Author';
    const description = overrides?.description ?? 'A test ebook for E2E.';
    const pageCount = overrides?.pageCount ?? 320;
    const language = overrides?.language ?? 'en';
    const publisher = overrides?.publisher ?? 'E2E Publisher';
    const isbn = overrides?.isbn ?? '978-0-123456-78-9';

    // Insert ebook
    const ebResult = await client.query(
      `INSERT INTO ebooks (title, description, page_count, language, publisher, isbn, file_path, file_name, size_bytes, format, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        title,
        description,
        pageCount,
        language,
        publisher,
        isbn,
        '/fake/e2e/path/book.epub',
        'book.epub',
        5000000,
        'epub',
        'available',
      ],
    );
    const ebookId = ebResult.rows[0].id as string;

    // Insert author
    const authorResult = await client.query(
      `INSERT INTO people (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [authorName],
    );
    const authorId = authorResult.rows[0].id as string;

    // Link author to ebook
    await client.query(
      `INSERT INTO ebook_authors (ebook_id, person_id, "order") VALUES ($1, $2, 0)`,
      [ebookId, authorId],
    );

    return { id: ebookId, title };
  } finally {
    await client.end();
  }
}

/**
 * Insert a test comic series into the database.
 * Returns the series id and title for use in navigation.
 */
export async function seedComicSeries(overrides?: {
  title?: string;
  folderPath?: string | null;
}): Promise<SeededComicSeries> {
  const client = getClient();
  await client.connect();

  try {
    const title = overrides?.title ?? 'E2E Test Comic Series';
    // folderPath must be unique in the DB; use null for virtual/merged series
    // When provided it must be unique across all series rows.
    const folderPath =
      overrides?.folderPath !== undefined
        ? overrides.folderPath
        : `e2e/comics/${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

    const result = await client.query(
      `INSERT INTO comic_series (title, folder_path, status)
       VALUES ($1, $2, 'available')
       RETURNING id`,
      [title, folderPath],
    );
    const seriesId = result.rows[0].id as string;

    return { id: seriesId, title };
  } finally {
    await client.end();
  }
}

/**
 * Insert a test comic book (issue) into the database.
 * The filePath must be unique; a random suffix is appended automatically.
 */
export async function seedComicBook(
  seriesId: string,
  overrides?: {
    number?: string;
    title?: string;
  },
): Promise<SeededComicBook> {
  const client = getClient();
  await client.connect();

  try {
    const number = overrides?.number ?? '1';
    const title = overrides?.title ?? null;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const filePath = `e2e/comics/issue-${number}-${suffix}.cbz`;
    const fileName = `issue-${number}-${suffix}.cbz`;

    const result = await client.query(
      `INSERT INTO comic_books
         (series_id, number, title, format, file_path, file_name, size_bytes, container, status)
       VALUES ($1, $2, $3, 'single_issue', $4, $5, 1000000, 'cbz', 'available')
       RETURNING id`,
      [seriesId, number, title, filePath, fileName],
    );
    const bookId = result.rows[0].id as string;

    return { id: bookId, seriesId };
  } finally {
    await client.end();
  }
}
