ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
-- better-auth 1.7 keys accounts on (issuer, accountId). Credential rows use
-- the synthetic issuer 'local:credential' (see createLocalAccountIssuer in
-- @better-auth/core); without this backfill every existing email/password
-- user is locked out after the upgrade. OIDC rows cannot be backfilled here
-- because their issuer is the instance-specific OIDC_ISSUER_URL — the
-- AccountIssuerBackfillService fills those in at startup.
UPDATE "account" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential' AND "issuer" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_idx" ON "account" USING btree ("issuer","account_id");
