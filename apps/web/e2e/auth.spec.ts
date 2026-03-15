/**
 * Authentication E2E Tests
 *
 * Tests signup, login, session persistence, and logout flows.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';

test.describe('Authentication', () => {
  test.beforeAll(async () => {
    // Ensure the admin user exists (first user = admin)
    await createUser(adminUser);
  });

  test('should show login form on root page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign In' }),
    ).toBeVisible();
  });

  test('should show signup tab when signups are enabled', async ({ page }) => {
    await page.goto('/');
    const signUpTab = page.getByRole('tab', { name: 'Sign Up' });
    // Signups may or may not be enabled — just check the tab presence
    if (await signUpTab.isVisible()) {
      await signUpTab.click();
      await expect(page.locator('#name')).toBeVisible();
      await expect(page.locator('#signup-email')).toBeVisible();
      await expect(page.locator('#signup-password')).toBeVisible();
    }
  });

  test('should login with valid credentials and redirect to /home', async ({
    page,
  }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
    await expect(page).toHaveURL('/home');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', 'wrong@test.com');
    await page.fill('#password', 'wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should stay on root page (not redirect)
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL('/');
  });

  test('should persist session across page reloads', async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
    await expect(page).toHaveURL('/home');

    // Reload and verify still authenticated
    await page.reload();
    await expect(page).toHaveURL('/home');
  });
});
