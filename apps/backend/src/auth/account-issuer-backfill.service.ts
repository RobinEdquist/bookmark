import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';

/**
 * Backfills `account.issuer` for rows created before better-auth 1.7.
 *
 * 1.7 resolves accounts strictly by (issuer, accountId) with no legacy
 * fallback, so a NULL issuer means the account can never match again:
 * credential users are locked out and OIDC sign-ins silently create a
 * duplicate user instead of finding the existing one.
 *
 * - Credential rows use the synthetic issuer 'local:credential' (also
 *   backfilled by migration 0036; repeated here idempotently so a database
 *   restored from a pre-1.7 backup heals on the next boot).
 * - OIDC rows use the configured OIDC_ISSUER_URL, which auth.provider.ts pins
 *   as the plugin's `accountIssuer`. This is instance-specific, which is why
 *   it cannot live in a migration.
 *
 * Errors deliberately propagate and fail startup: booting with NULL issuers
 * while OIDC is enabled would corrupt data on the next sign-in, which is
 * strictly worse than a loud crash.
 */
@Injectable()
export class AccountIssuerBackfillService implements OnModuleInit {
  private readonly logger = new Logger(AccountIssuerBackfillService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<Record<string, unknown>>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const credential = await this.db.execute(sql`
      UPDATE account SET issuer = 'local:credential'
      WHERE provider_id = 'credential' AND issuer IS NULL
    `);
    if (credential.rowCount) {
      this.logger.log(
        `Backfilled issuer on ${credential.rowCount} credential account(s)`,
      );
    }

    const issuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    if (
      this.configService.get<string>('OIDC_ENABLED') === 'true' &&
      issuerUrl
    ) {
      // If this UPDATE hits the (issuer, account_id) unique index, a
      // duplicate user was already created for the same identity after the
      // upgrade — that needs manual resolution, so failing loudly is correct.
      const oidc = await this.db.execute(sql`
        UPDATE account SET issuer = ${issuerUrl}
        WHERE provider_id = 'oidc' AND issuer IS NULL
      `);
      if (oidc.rowCount) {
        this.logger.log(
          `Backfilled issuer on ${oidc.rowCount} OIDC account(s) with ${issuerUrl}`,
        );
      }
    }
  }
}
