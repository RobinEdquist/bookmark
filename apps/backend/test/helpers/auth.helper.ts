/**
 * Authentication helpers for E2E tests.
 *
 * Creates test users via the Better Auth sign-up endpoint and
 * returns session cookies for authenticated requests.
 */

import { withCredentialAccess } from './credential-lock';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  cookie: string;
}

// Jest runs every e2e spec file in parallel workers against one shared
// backend + database, and the settings / signup-policy specs flip the
// global auth toggles (signupsEnabled, emailPasswordEnabled) in that
// database for brief windows. During a window the credential endpoints
// return 403 — including to this helper's own calls from other workers.
//
// withCredentialAccess (below) is what actually excludes those windows:
// every call here holds the advisory lock shared, so a spec can only flip
// a toggle while no credential call is in flight. This retry is the
// backstop for anything that mutates the toggles outside the lock, and
// should normally never fire. Only 403s are retried; a genuine policy
// regression still fails once the attempts are exhausted.
const TRANSIENT_403_ATTEMPTS = 10;
const TRANSIENT_403_DELAY_MS = 150;

interface StatusedError extends Error {
  status?: number;
}

async function withTransient403Retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TRANSIENT_403_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if ((error as StatusedError).status !== 403) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, TRANSIENT_403_DELAY_MS),
      );
    }
  }
  throw lastError;
}

function statusedError(message: string, status: number): Error {
  const error: StatusedError = new Error(message);
  error.status = status;
  return error;
}

/**
 * Sign up a new user and return session cookie.
 * The first user to sign up becomes admin automatically.
 */
export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<TestUser> {
  // The lock is taken per attempt, not around the whole retry loop: a
  // retry then re-queues behind any policy window instead of holding the
  // lock across its own backoff.
  return withTransient403Retry(() =>
    withCredentialAccess(async () => {
      const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
        redirect: 'manual',
      });

      if (!response.ok) {
        const body = await response.text();
        throw statusedError(
          `Sign-up failed for ${email}: ${response.status} ${body}`,
          response.status,
        );
      }

      const cookie = extractSessionCookie(response);
      const data = await response.json();

      return {
        id: data.user?.id ?? data.id,
        name,
        email,
        cookie,
      };
    }),
  );
}

/**
 * Sign in an existing user and return session cookie.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<TestUser> {
  return withTransient403Retry(() =>
    withCredentialAccess(async () => {
      const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'manual',
      });

      if (!response.ok) {
        const body = await response.text();
        throw statusedError(
          `Sign-in failed for ${email}: ${response.status} ${body}`,
          response.status,
        );
      }

      const cookie = extractSessionCookie(response);
      const data = await response.json();

      return {
        id: data.user?.id ?? data.id,
        name: data.user?.name ?? '',
        email,
        cookie,
      };
    }),
  );
}

/**
 * Shared admin user — the first user created in the test database.
 * Call this from any test file that needs admin access.
 * Each Jest test file gets its own module scope and files may run in
 * parallel, so we try sign-up first (creating the admin), fall back
 * to sign-in if it already exists, and retry to handle race conditions.
 */
let sharedAdmin: TestUser | null = null;

export async function getSharedAdmin(): Promise<TestUser> {
  if (sharedAdmin) return sharedAdmin;

  // Try sign-up first (becomes admin if first user in DB)
  try {
    sharedAdmin = await signUp(
      'Shared Admin',
      'shared-admin@test.com',
      'password123',
    );
    return sharedAdmin;
  } catch {
    // User already exists — fall through to sign-in
  }

  // Retry sign-in a few times (the user may still be mid-creation by another worker)
  for (let i = 0; i < 3; i++) {
    try {
      sharedAdmin = await signIn('shared-admin@test.com', 'password123');
      return sharedAdmin;
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw new Error('Failed to get shared admin user after retries');
}

function extractSessionCookie(response: Response): string {
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  const sessionCookies = setCookieHeaders
    .filter((c) => c.includes('better-auth.session_token'))
    .map((c) => c.split(';')[0]);

  if (sessionCookies.length === 0) {
    throw new Error('No session cookie returned from auth endpoint');
  }

  return sessionCookies.join('; ');
}
