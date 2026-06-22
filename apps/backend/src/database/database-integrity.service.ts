import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from './database-connection.constants';

/**
 * Verifies critical data-integrity invariants once at startup, after migrations
 * have run (see docker-entrypoint.sh, which runs `drizzle-kit migrate` before
 * the app boots).
 *
 * The progress upsert (ProgressService.updateProgress) and the restore importer
 * both rely on the `user_audiobook_progress_unique (user_id, audiobook_id)`
 * constraint being present and enforcing. If it silently goes missing — e.g.
 * via `drizzle-kit push` or a migration rewrite/consolidation that never
 * re-runs on an existing database — duplicate rows accumulate and every
 * UPDATE/upsert against a duplicated pair starts throwing
 * "duplicate key value violates unique constraint". This check makes that
 * failure mode loud and obvious instead of surfacing as user-facing 500s later.
 */
@Injectable()
export class DatabaseIntegrityService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseIntegrityService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Record<string, unknown>>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.checkProgressUniqueConstraint();
    } catch (err) {
      // Never block startup on the check itself failing — just report it.
      this.logger.error(
        'Database integrity check failed to run',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async checkProgressUniqueConstraint(): Promise<void> {
    // Is the unique constraint present AND backed by a valid index?
    const constraint = await this.db.execute<{ indisvalid: boolean }>(sql`
      SELECT i.indisvalid
      FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conname = 'user_audiobook_progress_unique'
    `);

    if (constraint.rows.length === 0) {
      this.logger.error(
        'MISSING unique constraint "user_audiobook_progress_unique" on ' +
          'user_audiobook_progress. Progress writes can create duplicate rows. ' +
          'Run migrations (drizzle-kit migrate); never use drizzle-kit push ' +
          'against a real database.',
      );
    } else if (constraint.rows[0]?.indisvalid === false) {
      this.logger.error(
        'Unique index for "user_audiobook_progress_unique" is INVALID and is ' +
          'not enforcing uniqueness. Duplicate progress rows can form. ' +
          'Rebuild it (DROP/ADD CONSTRAINT) — see migration 0028.',
      );
    }

    // Surface any existing duplicates regardless of constraint state.
    const dupes = await this.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM (
        SELECT 1
        FROM user_audiobook_progress
        GROUP BY user_id, audiobook_id
        HAVING COUNT(*) > 1
      ) d
    `);

    const dupeGroups = dupes.rows[0]?.count ?? 0;
    if (dupeGroups > 0) {
      this.logger.error(
        `Found ${dupeGroups} duplicated (user_id, audiobook_id) group(s) in ` +
          'user_audiobook_progress. Progress updates for these will fail until ' +
          'deduplicated — see migration 0028.',
      );
    } else {
      this.logger.log('Progress integrity check passed (no duplicate rows).');
    }
  }
}
