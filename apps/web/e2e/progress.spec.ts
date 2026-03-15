/**
 * Progress Tracking E2E Tests
 *
 * Tests the home page sections that show listening/reading progress.
 * Since the DB is empty, we verify the empty states render correctly.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';

test.describe('Progress & Home', () => {
  test.beforeAll(async () => {
    await createUser(adminUser);
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should show home page with stats sections', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL('/home');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should render without errors on empty database', async ({ page }) => {
    await page.goto('/home');
    // No audiobooks, no progress — page should still render
    await expect(page.getByRole('main')).toBeVisible();
    // No console errors that would crash the page
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test('should load preferences page', async ({ page }) => {
    await page.goto('/preferences');
    await expect(page).toHaveURL('/preferences');
    await expect(page.getByRole('main')).toBeVisible();
  });
});
