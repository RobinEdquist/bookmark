import { setTimeout as delay } from 'node:timers/promises';
import {
  acquireOpdsSettingsLock,
  OPDS_SETTINGS_WAIT_TIMEOUT,
} from './opds-settings-lock';

/** Real PostgreSQL contention, with a holder exceeding the former 15s timeout. */
describe('OPDS settings lock (e2e)', () => {
  it(
    'lets multiple queued callers outlast a slow holder and acquire after release',
    async () => {
      const releaseHolder = await acquireOpdsSettingsLock();
      let acquired = 0;
      const waiters = Promise.allSettled(
        Array.from({ length: 2 }, async () => {
          const release = await acquireOpdsSettingsLock();
          try {
            acquired++;
          } finally {
            await release();
          }
        }),
      );
      try {
        await delay(16_000);
        expect(acquired).toBe(0);
      } finally {
        await releaseHolder();
      }
      const results = await waiters;
      expect(results.map((result) => result.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      expect(acquired).toBe(2);
    },
    OPDS_SETTINGS_WAIT_TIMEOUT,
  );
});
