/**
 * Playwright auth helpers.
 *
 * Creates users via the backend API and logs in via the UI.
 */

import { type Page } from '@playwright/test';

const API_URL = 'http://localhost:3000';

interface TestUser {
  name: string;
  email: string;
  password: string;
}

/** Sign up a user via the backend API (bypasses UI for speed). */
export async function createUser(user: TestUser): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
    redirect: 'manual',
  });
  // 200 = created, 422 = already exists (both are fine)
  if (!response.ok && response.status !== 422) {
    const body = await response.text();
    throw new Error(
      `Failed to create user ${user.email}: ${response.status} ${body}`,
    );
  }
}

/** Log in via the UI — fills in the login form and waits for /home. */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/home', { timeout: 15000 });
}

/** Set up an authenticated session by creating the user + logging in. */
export async function loginAs(
  page: Page,
  user: TestUser,
): Promise<void> {
  await createUser(user);
  await loginViaUI(page, user.email, user.password);
}

export const adminUser: TestUser = {
  name: 'E2E Admin',
  email: 'e2e-admin@test.com',
  password: 'password123',
};

export const regularUser: TestUser = {
  name: 'E2E User',
  email: 'e2e-user@test.com',
  password: 'password123',
};
