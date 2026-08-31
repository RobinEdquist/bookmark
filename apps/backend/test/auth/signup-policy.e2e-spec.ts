/**
 * Signup policy E2E tests.
 *
 * Verifies that the "signups enabled" and "email/password authentication"
 * admin settings are enforced on the better-auth email sign-up endpoint.
 * better-auth routes are mounted as raw Express middleware ahead of the
 * Nest router, so Nest guards never run on them — the only server-side
 * enforcement lives in the better-auth `before` hook
 * (src/auth/auth.provider.ts). These tests are the regression net for
 * that hook.
 */
import { Client } from 'pg';
import { getSharedAdmin, TestUser } from '../helpers/auth.helper';
import { withCredentialPolicyWindow } from '../helpers/credential-lock';

const SERVER_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_URL = `${SERVER_BASE_URL}/api`;

let db: Client;

async function updateSettings(
  adminCookie: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${API_URL}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to update settings (${response.status}): ${await response.text()}`,
    );
  }
}

/**
 * Upserts both credential toggles directly in the database. Used instead of
 * PATCH /settings where the API's own validation gets in the way: the
 * settings endpoint refuses `emailPasswordEnabled: false` unless OIDC is
 * configured, which the e2e environment does not do. The better-auth hook
 * reads this table directly, so changes take effect immediately.
 */
async function setCredentialToggles(
  emailPasswordEnabled: boolean,
  signupsEnabled: boolean,
): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (id, email_password_enabled, signups_enabled)
     VALUES ('app_settings', $1, $2)
     ON CONFLICT (id) DO UPDATE SET
       email_password_enabled = $1,
       signups_enabled = $2`,
    [emailPasswordEnabled, signupsEnabled],
  );
}

async function signUpEmail(email: string): Promise<Response> {
  return fetch(`${SERVER_BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Signup Probe',
      email,
      password: 'password123',
    }),
    redirect: 'manual',
  });
}

describe('Signup policy (e2e)', () => {
  let admin: TestUser;

  beforeAll(async () => {
    admin = await getSharedAdmin();
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  // Every test here depends on a specific global toggle state, so each one
  // runs inside an exclusive credential window: other workers' sign-in and
  // sign-up calls queue behind it rather than racing it, and each test
  // restores the defaults in its own `finally` so the window closes even on
  // a failed assertion.
  //
  // The local signUpEmail/fetch calls below deliberately bypass the auth
  // helper: they must observe the 403 rather than queue for the lock, and
  // taking the shared lock from inside the exclusive window would deadlock
  // this worker's connection against itself.

  it('rejects email sign-up while signups are disabled', async () => {
    await withCredentialPolicyWindow(async () => {
      try {
        await updateSettings(admin.cookie, { signupsEnabled: false });

        const response = await signUpEmail(
          `signup-disabled-${Date.now()}@test.com`,
        );
        expect(response.status).toBe(403);

        const body = (await response.json()) as { message?: string };
        expect(body.message).toContain('Signups are currently disabled');
      } finally {
        await setCredentialToggles(true, true);
      }
    });
  });

  it('accepts email sign-up again once signups are re-enabled', async () => {
    await withCredentialPolicyWindow(async () => {
      await setCredentialToggles(true, true);

      const response = await signUpEmail(
        `signup-enabled-${Date.now()}@test.com`,
      );
      expect(response.status).toBe(200);
    });
  });

  it('rejects email sign-up and sign-in while email/password authentication is disabled (OIDC-only instance)', async () => {
    // An admin can turn off local credentials entirely (the settings API
    // only permits this once OIDC is configured — hence the direct DB
    // write here). Both sign-up and sign-in must stay shut even with the
    // signup toggle on: the previous hook behavior, restored after it was
    // lost in a rewrite.
    await withCredentialPolicyWindow(async () => {
      try {
        await setCredentialToggles(false, true);

        const signUpResponse = await signUpEmail(
          `signup-no-password-${Date.now()}@test.com`,
        );
        expect(signUpResponse.status).toBe(403);
        const signUpBody = (await signUpResponse.json()) as {
          message?: string;
        };
        expect(signUpBody.message).toContain(
          'Email/password authentication is disabled',
        );

        const signInResponse = await fetch(
          `${SERVER_BASE_URL}/api/auth/sign-in/email`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'shared-admin@test.com',
              password: 'password123',
            }),
            redirect: 'manual',
          },
        );
        expect(signInResponse.status).toBe(403);
        const signInBody = (await signInResponse.json()) as {
          message?: string;
        };
        expect(signInBody.message).toContain(
          'Email/password authentication is disabled',
        );
      } finally {
        await setCredentialToggles(true, true);
      }
    });
  });
});
