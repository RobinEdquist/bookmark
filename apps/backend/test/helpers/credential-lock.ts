/**
 * Cross-worker mutex for the credential endpoints.
 *
 * Jest runs the e2e spec files in parallel workers against one shared
 * backend and one shared database, so a spec that flips a global auth
 * toggle (signupsEnabled, emailPasswordEnabled) makes /sign-in/email and
 * /sign-up/email 403 for every other worker while the toggle is off.
 *
 * Postgres advisory locks give those workers a mutex they already share,
 * and the shared/exclusive shape matches the problem exactly:
 *
 * - Credential calls take the lock SHARED, so any number of workers
 *   authenticate concurrently. The normal case costs one round trip and
 *   never waits.
 * - A spec that flips a toggle takes it EXCLUSIVE, which waits for
 *   in-flight credential calls to finish and makes new ones queue until
 *   the toggle is restored.
 *
 * Nothing serializes except the toggle window itself, so the suite keeps
 * its parallelism. Postgres queues waiters, so a pending exclusive also
 * blocks newly arriving shared requests — no writer starvation.
 *
 * Advisory locks are scoped to the connection holding them, so a crashed
 * worker releases automatically; there is no stuck-lock failure mode.
 */
import { Client } from 'pg';

/** Arbitrary key, shared by every worker. Only this module uses it. */
const CREDENTIAL_POLICY_LOCK = 4711;

/**
 * Waiting longer than this means a spec took the lock and never released
 * it. Failing with a lock timeout is far easier to debug than jest's
 * 30s test timeout with no explanation.
 */
const LOCK_TIMEOUT = '15s';

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (!client) {
    const next = new Client({ connectionString: process.env.DATABASE_URL });
    await next.connect();
    await next.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
    client = next;
  }
  return client;
}

/**
 * Closes this worker's lock connection. Registered as a global afterAll in
 * setup/after-env.ts — without it the open handle keeps jest alive.
 */
export async function closeCredentialLock(): Promise<void> {
  const open = client;
  client = null;
  await open?.end();
}

async function withLock<T>(
  mode: 'shared' | 'exclusive',
  fn: () => Promise<T>,
): Promise<T> {
  const c = await getClient();
  const acquire =
    mode === 'shared' ? 'pg_advisory_lock_shared' : 'pg_advisory_lock';
  const release =
    mode === 'shared' ? 'pg_advisory_unlock_shared' : 'pg_advisory_unlock';

  await c.query(`SELECT ${acquire}($1)`, [CREDENTIAL_POLICY_LOCK]);
  try {
    return await fn();
  } finally {
    await c.query(`SELECT ${release}($1)`, [CREDENTIAL_POLICY_LOCK]);
  }
}

/**
 * Runs a credential call (sign-in / sign-up) under the shared lock.
 *
 * Never call this from inside withCredentialPolicyWindow on the same
 * worker: one connection escalating shared -> exclusive deadlocks against
 * itself.
 */
export function withCredentialAccess<T>(fn: () => Promise<T>): Promise<T> {
  return withLock('shared', fn);
}

/**
 * Runs a block that depends on, or changes, a global credential toggle.
 * Blocks every other worker's sign-in/sign-up for the duration, so keep
 * the block short and always restore the toggle inside it.
 */
export function withCredentialPolicyWindow<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return withLock('exclusive', fn);
}
