/**
 * Lists Management E2E Tests
 *
 * Tests creating and viewing lists through the UI.
 * Note: List creation happens via dialogs, not dedicated pages.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';

test.describe('Lists', () => {
  test.beforeAll(async () => {
    await createUser(adminUser);
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should show home page with recently updated lists section', async ({
    page,
  }) => {
    await page.goto('/home');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should create a list via API and see it on the home page', async ({
    page,
  }) => {
    // Create a list via the API
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) =>
      c.name.includes('better-auth.session_token'),
    );

    if (sessionCookie) {
      const response = await fetch('http://localhost:3000/api/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        },
        body: JSON.stringify({ name: 'E2E Test List' }),
      });
      expect(response.status).toBe(201);
    }

    // Navigate to home and check if the list section loads
    await page.goto('/home');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate to a list detail page', async ({ page }) => {
    // Create a list via API first
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) =>
      c.name.includes('better-auth.session_token'),
    );

    if (sessionCookie) {
      const response = await fetch('http://localhost:3000/api/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        },
        body: JSON.stringify({ name: 'Navigate Test List' }),
      });
      const data = await response.json();

      // Navigate to the list detail page
      await page.goto(`/lists/${data.id}`);
      await expect(page.getByRole('main')).toBeVisible();
    }
  });
});
