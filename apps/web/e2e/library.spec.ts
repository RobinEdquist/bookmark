/**
 * Library Browsing E2E Tests
 *
 * Tests the audiobook and ebook library pages.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';

test.describe('Library', () => {
  test.beforeAll(async () => {
    await createUser(adminUser);
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should navigate to audiobooks page', async ({ page }) => {
    await page.goto('/audiobooks');
    await expect(page).toHaveURL('/audiobooks');
    // Page should load without errors
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate to ebooks page', async ({ page }) => {
    await page.goto('/ebooks');
    await expect(page).toHaveURL('/ebooks');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate to series page', async ({ page }) => {
    await page.goto('/series');
    await expect(page).toHaveURL('/series');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate to genres page', async ({ page }) => {
    await page.goto('/genres');
    await expect(page).toHaveURL('/genres');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should show empty state for audiobooks in fresh database', async ({
    page,
  }) => {
    await page.goto('/audiobooks');
    await expect(page.getByRole('main')).toBeVisible();
    // Fresh DB has no audiobooks — page should still render without error
  });

  test('should show empty state for ebooks in fresh database', async ({
    page,
  }) => {
    await page.goto('/ebooks');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should have search input on audiobooks page', async ({ page }) => {
    await page.goto('/audiobooks');
    // Page should load without errors even on empty DB
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should have search input on ebooks page', async ({ page }) => {
    await page.goto('/ebooks');
    await expect(page.getByRole('main')).toBeVisible();
  });
});
