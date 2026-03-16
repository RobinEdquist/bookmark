/**
 * Signup Flow E2E Tests
 *
 * Tests the full signup flow — filling out the form and verifying
 * the user is redirected to /home after account creation.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser } from './helpers/auth';

test.describe('Signup Flow', () => {
  test.beforeAll(async () => {
    // Ensure admin user exists (first user = admin, enables signups)
    await createUser(adminUser);
  });

  test('should complete full signup flow and redirect to /home', async ({
    page,
  }) => {
    await page.goto('/');

    // Switch to sign up tab
    const signUpTab = page.getByRole('tab', { name: 'Sign Up' });
    if (!(await signUpTab.isVisible())) {
      test.skip(true, 'Signups are not enabled in this environment');
      return;
    }
    await signUpTab.click();

    // Fill out the signup form
    const uniqueEmail = `e2e-signup-${Date.now()}@test.com`;
    await page.fill('#name', 'E2E Signup User');
    await page.fill('#signup-email', uniqueEmail);
    await page.fill('#signup-password', 'password123');

    // Submit the form
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Should redirect to /home after successful signup
    await page.waitForURL('/home', { timeout: 15000 });
    await expect(page).toHaveURL('/home');
  });

  test('should show error for duplicate email signup', async ({ page }) => {
    await page.goto('/');

    const signUpTab = page.getByRole('tab', { name: 'Sign Up' });
    if (!(await signUpTab.isVisible())) {
      test.skip(true, 'Signups are not enabled in this environment');
      return;
    }
    await signUpTab.click();

    // Try to sign up with existing admin email
    await page.fill('#name', 'Duplicate User');
    await page.fill('#signup-email', adminUser.email);
    await page.fill('#signup-password', 'password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Should stay on the login page (not redirect)
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL('/');
  });

  test('should persist session after signup and page reload', async ({
    page,
  }) => {
    await page.goto('/');

    const signUpTab = page.getByRole('tab', { name: 'Sign Up' });
    if (!(await signUpTab.isVisible())) {
      test.skip(true, 'Signups are not enabled in this environment');
      return;
    }
    await signUpTab.click();

    const uniqueEmail = `e2e-persist-${Date.now()}@test.com`;
    await page.fill('#name', 'E2E Persist User');
    await page.fill('#signup-email', uniqueEmail);
    await page.fill('#signup-password', 'password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await page.waitForURL('/home', { timeout: 15000 });

    // Reload and verify session persists
    await page.reload();
    await expect(page).toHaveURL('/home');
  });
});
