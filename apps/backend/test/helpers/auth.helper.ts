/**
 * Authentication helpers for E2E tests.
 *
 * Creates test users via the Better Auth sign-up endpoint and
 * returns session cookies for authenticated requests.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  cookie: string;
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
  const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sign-up failed for ${email}: ${response.status} ${body}`);
  }

  const cookie = extractSessionCookie(response);
  const data = await response.json();

  return {
    id: data.user?.id ?? data.id,
    name,
    email,
    cookie,
  };
}

/**
 * Sign in an existing user and return session cookie.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<TestUser> {
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sign-in failed for ${email}: ${response.status} ${body}`);
  }

  const cookie = extractSessionCookie(response);
  const data = await response.json();

  return {
    id: data.user?.id ?? data.id,
    name: data.user?.name ?? '',
    email,
    cookie,
  };
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
