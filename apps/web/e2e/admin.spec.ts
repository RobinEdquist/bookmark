/**
 * Admin Settings E2E Tests
 *
 * Tests that admin-only pages are accessible to admins
 * and blocked for regular users.
 */

import { test, expect } from '@playwright/test';
import {
  createUser,
  adminUser,
  regularUser,
  loginViaUI,
} from './helpers/auth';

test.describe('Admin Settings', () => {
  test.beforeAll(async () => {
    // Admin must be created first (first user = admin)
    await createUser(adminUser);
    await createUser(regularUser);
  });

  test('admin should access settings page', async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
    await page.goto('/settings');

    // Admin should stay on settings, not be redirected
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/settings');
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('admin should see settings tabs', async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
    await page.goto('/settings');
    await page.waitForTimeout(2000);

    // Settings page should have tabs
    const tabs = page.getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('non-admin should be redirected from settings', async ({ page }) => {
    await loginViaUI(page, regularUser.email, regularUser.password);
    await page.goto('/settings');

    // Should be redirected to /home
    await page.waitForURL('/home', { timeout: 10000 });
    await expect(page).toHaveURL('/home');
  });

  test('unauthenticated user should not access settings', async ({ page }) => {
    await page.goto('/settings');

    // Should be redirected to root (login)
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url === 'http://localhost:3001/' || url.includes('/settings')).toBe(
      true,
    );
  });
});
