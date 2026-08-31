/**
 * Per-spec-file setup (jest-e2e.json setupFilesAfterEnv).
 *
 * The advisory-lock connection is opened lazily, once per worker. Without
 * closing it the open handle keeps jest from exiting.
 */
import { closeCredentialLock } from '../helpers/credential-lock';

afterAll(async () => {
  await closeCredentialLock();
});
