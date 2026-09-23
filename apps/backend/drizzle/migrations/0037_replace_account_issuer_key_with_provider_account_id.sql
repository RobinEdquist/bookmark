-- better-auth 1.7.3+ (this upgrade installs 1.7.5) identifies accounts by
-- (provider_id, account_id). The 1.7.0–1.7.2 unique index on
-- (issuer, account_id) is no longer the identity key.
--
-- `issuer` stays on the table and stays nullable. better-auth does not
-- read or write it, so existing values are NOT rewritten. A discovered
-- issuer that differs from OIDC_ISSUER_URL (trailing slash, alias) does
-- not create a second account, because the lookup does not include
-- issuer. OIDC account_id remains the verified `sub`, which 1.7.2
-- already stored. No issuer backfill is required for this upgrade.
--
-- If the check below fails, two rows already share one sign-in identity
-- (usually an OIDC user created twice under different issuer strings).
-- Merge them by hand, then retry. Do not drop the check.
--
-- Rollback to 1.7.2, which looks up (issuer, account_id) and needs the
-- `accountIssuer: OIDC_ISSUER_URL` pin restored in auth.provider.ts:
--   1. Backfill NULLs before downgrading, or those users will not match:
--        UPDATE account SET issuer = 'local:credential'
--          WHERE provider_id = 'credential' AND issuer IS NULL;
--        UPDATE account SET issuer = '<exact OIDC_ISSUER_URL>'
--          WHERE provider_id = 'oidc' AND issuer IS NULL;
--      The OIDC value must equal the configured OIDC_ISSUER_URL, not the
--      discovery document's issuer.
--   2. DROP INDEX account_provider_id_account_id_idx;
--   3. CREATE UNIQUE INDEX account_issuer_account_id_idx
--        ON account USING btree (issuer, account_id);
--   4. Pin better-auth and @better-auth/api-key back to 1.7.2.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1
    FROM account
    GROUP BY provider_id, account_id
    HAVING count(*) > 1
  ) duplicates;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'better-auth 1.7.5 upgrade: % duplicate (provider_id, account_id) group(s) in account. Resolve them before upgrading. Query: SELECT provider_id, account_id, count(*) FROM account GROUP BY 1, 2 HAVING count(*) > 1',
      dup_count;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX "account_issuer_account_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_id_account_id_idx" ON "account" USING btree ("provider_id","account_id");