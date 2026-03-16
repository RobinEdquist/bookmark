/**
 * Detail Page E2E Tests
 *
 * Tests audiobook and ebook detail pages with seeded data,
 * as well as error states for non-existent items.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';
import {
  seedAudiobook,
  seedEbook,
  type SeededAudiobook,
  type SeededEbook,
} from './helpers/seed';

test.describe('Audiobook Detail Page', () => {
  let audiobook: SeededAudiobook;

  test.beforeAll(async () => {
    await createUser(adminUser);
    audiobook = await seedAudiobook({
      title: 'The Great E2E Audiobook',
      authorName: 'Jane Doe',
      narratorName: 'John Smith',
      description: 'An excellent audiobook for testing.',
      duration: 7200,
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should display audiobook details', async ({ page }) => {
    await page.goto(`/audiobooks/${audiobook.id}`);

    // Title should be visible
    await expect(
      page.getByRole('heading', { name: 'The Great E2E Audiobook' }),
    ).toBeVisible();

    // Author and narrator metadata
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('John Smith')).toBeVisible();

    // Duration should be displayed (7200s = 2h 0m)
    await expect(page.getByText('2h 0m')).toBeVisible();

    // Description
    await expect(
      page.getByText('An excellent audiobook for testing.'),
    ).toBeVisible();
  });

  test('should show play button', async ({ page }) => {
    await page.goto(`/audiobooks/${audiobook.id}`);

    await expect(
      page.getByRole('button', { name: /Play/i }),
    ).toBeVisible();
  });

  test('should show chapters and files accordions', async ({ page }) => {
    await page.goto(`/audiobooks/${audiobook.id}`);

    // Chapters accordion trigger
    await expect(page.getByText(/Chapters/)).toBeVisible();

    // Files accordion trigger
    await expect(page.getByText(/Files/)).toBeVisible();
  });

  test('should show error state for non-existent audiobook', async ({
    page,
  }) => {
    await page.goto('/audiobooks/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('Failed to load audiobook')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to Library' }),
    ).toBeVisible();
  });

  test('should navigate back to library from error state', async ({
    page,
  }) => {
    await page.goto('/audiobooks/00000000-0000-0000-0000-000000000000');

    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page).toHaveURL('/audiobooks');
  });
});

test.describe('Ebook Detail Page', () => {
  let ebook: SeededEbook;

  test.beforeAll(async () => {
    await createUser(adminUser);
    ebook = await seedEbook({
      title: 'The Great E2E Ebook',
      authorName: 'Alice Writer',
      description: 'A wonderful ebook for testing.',
      pageCount: 450,
      publisher: 'Test Publishing Co.',
      isbn: '978-1-234567-89-0',
      language: 'en',
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should display ebook details', async ({ page }) => {
    await page.goto(`/ebooks/${ebook.id}`);

    // Title
    await expect(
      page.getByRole('heading', { name: 'The Great E2E Ebook' }),
    ).toBeVisible();

    // Author
    await expect(page.getByText('Alice Writer')).toBeVisible();

    // Page count
    await expect(page.getByText('450')).toBeVisible();

    // Description
    await expect(
      page.getByText('A wonderful ebook for testing.'),
    ).toBeVisible();
  });

  test('should show additional info section', async ({ page }) => {
    await page.goto(`/ebooks/${ebook.id}`);

    await expect(page.getByText('Additional Information')).toBeVisible();
    await expect(page.getByText('Test Publishing Co.')).toBeVisible();
    await expect(page.getByText('978-1-234567-89-0')).toBeVisible();
  });

  test('should show file info', async ({ page }) => {
    await page.goto(`/ebooks/${ebook.id}`);

    // Format and size (EPUB • 4.8 MB)
    await expect(page.getByText(/EPUB/)).toBeVisible();
  });

  test('should show download button', async ({ page }) => {
    await page.goto(`/ebooks/${ebook.id}`);

    await expect(
      page.getByRole('button', { name: /Download/i }),
    ).toBeVisible();
  });

  test('should show error state for non-existent ebook', async ({ page }) => {
    await page.goto('/ebooks/00000000-0000-0000-0000-000000000000');

    await expect(page.getByText('Failed to load ebook')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to Library' }),
    ).toBeVisible();
  });

  test('should navigate back to library from error state', async ({
    page,
  }) => {
    await page.goto('/ebooks/00000000-0000-0000-0000-000000000000');

    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page).toHaveURL('/ebooks');
  });
});
