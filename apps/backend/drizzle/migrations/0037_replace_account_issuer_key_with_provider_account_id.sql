-- better-auth 1.7.3+ (this upgrade installs 1.7.5) identifies accounts by
-- (provider_id, account_id). The 1.7.0–1.7.2 unique index on
-- (issuer, account_id) is no longer the identity key.
--
-- `issuer` stays on the table and stays nullable. better-auth does not
-- read or write it, so existing values are not rewritten. A discovered
-- issuer that differs from OIDC_ISSUER_URL (trailing slash, alias) does
-- not create a second account, because the lookup does not include
-- issuer. OIDC account_id remains the verified `sub`, which 1.7.2
-- already stored.
--
-- Duplicate (provider_id, account_id) rows are collapsed below, before
-- the new unique index. The earliest account is the sign-in that already
-- worked. A later row is the one created when an issuer mismatch missed
-- it. If that later row is someone's only login, their library is moved
-- onto the kept user and the extra user is removed.
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
-- account-identity-collapse:start
DO $collapse$
DECLARE
  grp record;
  keeper_id text;
  keeper_user text;
  loser record;
  from_user text;
  to_user text;
BEGIN
  FOR grp IN
    SELECT provider_id, account_id
    FROM account
    GROUP BY provider_id, account_id
    HAVING count(*) > 1
  LOOP
    SELECT id, user_id INTO keeper_id, keeper_user
    FROM account
    WHERE provider_id = grp.provider_id
      AND account_id = grp.account_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    UPDATE account AS keeper
    SET
      password = COALESCE(keeper.password, (
        SELECT password FROM account
        WHERE provider_id = grp.provider_id
          AND account_id = grp.account_id
          AND id <> keeper_id
          AND password IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )),
      access_token = COALESCE(keeper.access_token, (
        SELECT access_token FROM account
        WHERE provider_id = grp.provider_id
          AND account_id = grp.account_id
          AND id <> keeper_id
          AND access_token IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )),
      refresh_token = COALESCE(keeper.refresh_token, (
        SELECT refresh_token FROM account
        WHERE provider_id = grp.provider_id
          AND account_id = grp.account_id
          AND id <> keeper_id
          AND refresh_token IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )),
      id_token = COALESCE(keeper.id_token, (
        SELECT id_token FROM account
        WHERE provider_id = grp.provider_id
          AND account_id = grp.account_id
          AND id <> keeper_id
          AND id_token IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )),
      scope = COALESCE(keeper.scope, (
        SELECT scope FROM account
        WHERE provider_id = grp.provider_id
          AND account_id = grp.account_id
          AND id <> keeper_id
          AND scope IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ))
    WHERE keeper.id = keeper_id;

    FOR loser IN
      SELECT id, user_id
      FROM account
      WHERE provider_id = grp.provider_id
        AND account_id = grp.account_id
        AND id <> keeper_id
      ORDER BY created_at ASC, id ASC
    LOOP
      IF loser.user_id IS DISTINCT FROM keeper_user
        AND EXISTS (SELECT 1 FROM "user" WHERE id = loser.user_id)
        AND NOT EXISTS (
          SELECT 1 FROM account
          WHERE user_id = loser.user_id
            AND NOT (
              provider_id = grp.provider_id
              AND account_id = grp.account_id
            )
        )
      THEN
        from_user := loser.user_id;
        to_user := keeper_user;

        UPDATE "user" AS dest
        SET role = CASE
          WHEN dest.role = 'admin' OR src.role = 'admin' THEN 'admin'
          ELSE dest.role
        END
        FROM "user" AS src
        WHERE dest.id = to_user
          AND src.id = from_user;

        UPDATE user_permissions AS dest
        SET
          can_edit_metadata = dest.can_edit_metadata OR src.can_edit_metadata,
          can_upload = dest.can_upload OR src.can_upload,
          can_delete = dest.can_delete OR src.can_delete,
          can_generate_api_keys = dest.can_generate_api_keys OR src.can_generate_api_keys,
          can_request_content = dest.can_request_content OR src.can_request_content,
          can_generate_audiobooks = dest.can_generate_audiobooks OR src.can_generate_audiobooks
        FROM user_permissions AS src
        WHERE dest.user_id = to_user
          AND src.user_id = from_user;

        DELETE FROM user_audiobook_progress AS incoming
        USING user_audiobook_progress AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.audiobook_id = existing.audiobook_id
          AND (
            existing.updated_at > incoming.updated_at
            OR (
              existing.updated_at = incoming.updated_at
              AND existing.current_position >= incoming.current_position
            )
          );
        DELETE FROM user_audiobook_progress AS existing
        USING user_audiobook_progress AS incoming
        WHERE existing.user_id = to_user
          AND incoming.user_id = from_user
          AND existing.audiobook_id = incoming.audiobook_id;
        UPDATE user_audiobook_progress
        SET user_id = to_user
        WHERE user_id = from_user;

        DELETE FROM user_ebook_progress AS incoming
        USING user_ebook_progress AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.ebook_id = existing.ebook_id
          AND (
            existing.updated_at > incoming.updated_at
            OR (
              existing.updated_at = incoming.updated_at
              AND existing.progress_percent >= incoming.progress_percent
            )
          );
        DELETE FROM user_ebook_progress AS existing
        USING user_ebook_progress AS incoming
        WHERE existing.user_id = to_user
          AND incoming.user_id = from_user
          AND existing.ebook_id = incoming.ebook_id;
        UPDATE user_ebook_progress
        SET user_id = to_user
        WHERE user_id = from_user;

        DELETE FROM comic_book_progress AS incoming
        USING comic_book_progress AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.comic_book_id = existing.comic_book_id
          AND (
            existing.updated_at > incoming.updated_at
            OR (
              existing.updated_at = incoming.updated_at
              AND existing.current_page >= incoming.current_page
            )
          );
        DELETE FROM comic_book_progress AS existing
        USING comic_book_progress AS incoming
        WHERE existing.user_id = to_user
          AND incoming.user_id = from_user
          AND existing.comic_book_id = incoming.comic_book_id;
        UPDATE comic_book_progress
        SET user_id = to_user
        WHERE user_id = from_user;

        DELETE FROM user_blacklisted_tags AS incoming
        USING user_blacklisted_tags AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.tag_id = existing.tag_id;
        UPDATE user_blacklisted_tags
        SET user_id = to_user
        WHERE user_id = from_user;

        DELETE FROM announcement_dismissals AS incoming
        USING announcement_dismissals AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.announcement_id = existing.announcement_id;
        UPDATE announcement_dismissals
        SET user_id = to_user
        WHERE user_id = from_user;

        DELETE FROM request_supporters AS incoming
        USING request_supporters AS existing
        WHERE incoming.user_id = from_user
          AND existing.user_id = to_user
          AND incoming.request_id = existing.request_id;
        UPDATE request_supporters
        SET user_id = to_user
        WHERE user_id = from_user;

        UPDATE session SET user_id = to_user WHERE user_id = from_user;
        UPDATE api_key SET user_id = to_user WHERE user_id = from_user;
        UPDATE listening_sessions SET user_id = to_user WHERE user_id = from_user;
        UPDATE audiobook_bookmarks SET user_id = to_user WHERE user_id = from_user;
        UPDATE lists SET user_id = to_user WHERE user_id = from_user;
        UPDATE announcements SET created_by = to_user WHERE created_by = from_user;
        UPDATE requests SET user_id = to_user WHERE user_id = from_user;
        UPDATE requests
        SET auto_approved_by_user_id = to_user
        WHERE auto_approved_by_user_id = from_user;
        UPDATE import_errors SET ignored_by = to_user WHERE ignored_by = from_user;

        DELETE FROM "user" WHERE id = from_user;
      END IF;

      DELETE FROM account WHERE id = loser.id;
    END LOOP;
  END LOOP;
END
$collapse$;
-- account-identity-collapse:end
--> statement-breakpoint
DROP INDEX "account_issuer_account_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_id_account_id_idx" ON "account" USING btree ("provider_id","account_id");
