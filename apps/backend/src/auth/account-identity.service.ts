import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';

const MIGRATION_FILE =
  '0037_replace_account_issuer_key_with_provider_account_id.sql';
const COLLAPSE_START = '-- account-identity-collapse:start';
const COLLAPSE_END = '-- account-identity-collapse:end';

/**
 * The collapse statement lives in migration 0037, which runs before the
 * app boots. Run it again here so a database restored from a backup that
 * still has duplicate sign-in rows is repaired on startup. The earliest
 * account is kept. A later row's user is folded in when that row was their
 * only login.
 */
export function loadAccountIdentityCollapseSql(): string {
  const candidates = [
    join(process.cwd(), 'drizzle/migrations', MIGRATION_FILE),
    join(__dirname, '../../../drizzle/migrations', MIGRATION_FILE),
    join(__dirname, '../../drizzle/migrations', MIGRATION_FILE),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error(
      `Account identity migration not found. Looked in ${candidates.join(', ')}`,
    );
  }

  const migration = readFileSync(path, 'utf8');
  const start = migration.indexOf(COLLAPSE_START);
  const end = migration.indexOf(COLLAPSE_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      'Account identity collapse SQL is missing from migration 0037.',
    );
  }

  return migration.slice(start + COLLAPSE_START.length, end).trim();
}

/**
 * Successor to the 1.7.0–1.7.2 issuer backfill.
 *
 * better-auth 1.7.3+ identifies accounts by (provider_id, account_id) and
 * does not read or write `account.issuer`. Stamping NULL issuers with
 * OIDC_ISSUER_URL or `local:credential` would diverge from rows the library
 * creates, so this service does not touch the column. Historical issuer
 * values stay where they are; they are not part of the lookup.
 */
@Injectable()
export class AccountIdentityService implements OnModuleInit {
  private readonly logger = new Logger(AccountIdentityService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Record<string, unknown>>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.db.execute(sql.raw(loadAccountIdentityCollapseSql()));
    this.logger.log(
      'Account identity key is (provider_id, account_id). issuer is not read or written by better-auth and was left unchanged.',
    );
  }
}
