import { Client } from 'pg';

/** Separate from the credential-policy lock: OPDS suites also sign in. */
const OPDS_SETTINGS_LOCK = 4712;

/** Suite leases can outlast a single test; give queued callers their own budget. */
export const OPDS_SETTINGS_WAIT_TIMEOUT = 120_000;

/**
 * OPDS suites and the settings test share one backend across Jest workers.
 * Hold this lease from before reading opdsEnabled until after restoring it,
 * so another suite cannot disable the catalog during HTTP assertions.
 * A dedicated connection also releases the lock if its worker crashes.
 */
export async function acquireOpdsSettingsLock(): Promise<() => Promise<void>> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    // The holder runs a whole suite, so a short PostgreSQL lock timeout would
    // fail healthy waiters. Callers use OPDS_SETTINGS_WAIT_TIMEOUT for Jest.
    await client.query("SET lock_timeout = '0'");
    await client.query('SELECT pg_advisory_lock($1)', [OPDS_SETTINGS_LOCK]);
    return () => client.end();
  } catch (error) {
    await client.end();
    throw error;
  }
}

export async function withOpdsSettingsWindow<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireOpdsSettingsLock();
  try {
    return await fn();
  } finally {
    await release();
  }
}
