import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';

interface DuplicateAccountKey {
  provider_id: string;
  account_id: string;
  n: number;
}

/**
 * Successor to the 1.7.0–1.7.2 issuer backfill.
 *
 * better-auth 1.7.3+ identifies accounts by (provider_id, account_id) and
 * does not read or write `account.issuer`. Stamping NULL issuers with
 * OIDC_ISSUER_URL or `local:credential` would diverge from rows the library
 * creates, so this service does not touch the column. Historical issuer
 * values stay where they are; they are not part of the lookup.
 *
 * Duplicate (provider_id, account_id) pairs are rejected by better-auth
 * instead of selecting a row, which surfaces as a failed sign-in. Failing
 * startup is the same failure, earlier. Migration 0037 enforces the same
 * key; this check still runs so a database that skipped the migration
 * cannot serve traffic with an ambiguous identity.
 */
@Injectable()
export class AccountIdentityService implements OnModuleInit {
  private readonly logger = new Logger(AccountIdentityService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Record<string, unknown>>,
  ) {}

  async onModuleInit(): Promise<void> {
    const duplicates = await this.db.execute(sql`
      SELECT provider_id, account_id, count(*)::int AS n
      FROM account
      GROUP BY provider_id, account_id
      HAVING count(*) > 1
    `);
    const rows = duplicates.rows as unknown as DuplicateAccountKey[];

    if (rows.length > 0) {
      const summary = rows
        .map((row) => `${row.provider_id}/${row.account_id} (${row.n})`)
        .join(', ');
      throw new Error(
        `Duplicate account identities for (provider_id, account_id): ${summary}. better-auth 1.7.3+ rejects these lookups instead of choosing a row.`,
      );
    }

    this.logger.log(
      'Account identity key is (provider_id, account_id). issuer is not read or written by better-auth and was left unchanged.',
    );
  }
}
