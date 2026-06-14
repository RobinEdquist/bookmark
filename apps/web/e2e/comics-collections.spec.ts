/**
 * Comics — Collections browse + membership (E2E)
 *
 * Prerequisites (fulfilled automatically by global-setup.ts):
 *   - PostgreSQL testcontainer running with migrations applied.
 *   - NestJS backend running on http://localhost:3000.
 *   - Next.js dev server running on http://localhost:3001.
 *
 * The test seeds two comic series and exercises the full collections flow as
 * an admin user:
 *
 *   1. Admin logs in via the UI login form.
 *   2. From the comics library, open Series A's card ⋮ menu.
 *   3. Click "Add to collection".
 *   4. In the AddToCollectionDialog, type a new name "E2E Collection".
 *   5. Click the "Create new collection …" button.
 *   6. Assert a success toast ("Collection created").
 *   7. Navigate to /comics?view=collections and assert "E2E Collection" card.
 *   8. Click the collection card → detail page shows heading + Series A member.
 *   9. (Optional) Add Series B to the same collection via its card menu, then
 *      verify Series B also appears on the collection detail page.
 */

import { test, expect } from '@playwright/test';
import { createUser, adminUser, loginViaUI } from './helpers/auth';
import { seedComicSeries, type SeededComicSeries } from './helpers/seed';

test.describe('Comics — Collections browse + membership', () => {
  // Seeded series — IDs are available for direct navigation if needed in future tests.
  let seriesA: SeededComicSeries; // eslint-disable-line @typescript-eslint/no-unused-vars
  let seriesB: SeededComicSeries; // eslint-disable-line @typescript-eslint/no-unused-vars

  test.beforeAll(async () => {
    // Ensure the admin user exists (first user becomes admin on a fresh DB).
    await createUser(adminUser);

    // Seed two series used throughout the suite.
    seriesA = await seedComicSeries({ title: 'E2E Coll Series A' });
    seriesB = await seedComicSeries({ title: 'E2E Coll Series B' });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test('should create a collection via the series card menu and browse it', async ({
    page,
  }) => {
    // ── Step 1: Navigate to the comics library ────────────────────────────────
    await page.goto('/comics');

    // Series A card should appear in the grid.
    await expect(page.getByRole('heading', { name: 'E2E Coll Series A' })).toBeVisible({
      timeout: 10000,
    });

    // ── Step 2: Open Series A's card ⋮ menu ──────────────────────────────────
    // The DropdownMenuTrigger button has aria-label = t("card.menu") = "Open menu".
    // There may be multiple series cards; scope to the article that contains
    // Series A's title to click the right one.
    const seriesAArticle = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'E2E Coll Series A' }),
    });
    await seriesAArticle.getByRole('button', { name: 'Open menu' }).click();

    // ── Step 3: Click "Add to collection" ─────────────────────────────────────
    // t("collections.addToCollection") = "Add to collection"
    await page.getByRole('menuitem', { name: 'Add to collection' }).click();

    // The AddToCollectionDialog should now be open.
    await expect(page.getByRole('dialog')).toBeVisible();

    // ── Step 4: Type the new collection name ──────────────────────────────────
    const nameInput = page.getByPlaceholder('Search collections…');
    await nameInput.fill('E2E Collection');

    // ── Step 5: Click the "Create new collection …" button ────────────────────
    // t("collections.createNew", { name: "E2E Collection" }) =
    //   'Create new collection "E2E Collection"'
    // Match via regex to avoid quote-style brittleness.
    await page.getByRole('button', { name: /Create new collection/ }).click();

    // ── Step 6: Assert success toast ─────────────────────────────────────────
    // t("collections.createSuccess") = "Collection created"
    await expect(page.getByText(/Collection created/)).toBeVisible({
      timeout: 10000,
    });

    // Dialog should close after success.
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // ── Step 7: Navigate to Collections view and assert the card ─────────────
    // The toggle link href is /comics?view=collections.
    // t("collections.tabCollections") = "Collections"
    await page.getByRole('link', { name: 'Collections', exact: true }).click();
    await page.waitForURL(/view=collections/, { timeout: 5000 });

    const collectionCard = page.getByRole('heading', { name: 'E2E Collection' });
    await expect(collectionCard).toBeVisible({ timeout: 10000 });

    // ── Step 8: Open the collection detail page ───────────────────────────────
    // The collection card is a <Link> wrapping the <h3>; click the heading.
    await collectionCard.click();

    // Wait for the detail page to load (URL changes to /comics/collections/<id>).
    await page.waitForURL(/\/comics\/collections\//, { timeout: 10000 });

    // Heading on the detail page renders collection.name inside <h1>.
    await expect(page.getByRole('heading', { name: 'E2E Collection' })).toBeVisible();

    // Series A should appear as a member (its title is rendered in a nested <h3>
    // inside a ComicSeriesCard).
    await expect(page.getByRole('heading', { name: 'E2E Coll Series A' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should add a second series to an existing collection', async ({
    page,
  }) => {
    // This test depends on "E2E Collection" already existing from the previous
    // test run (same beforeAll seed). If tests run in isolation this test is
    // naturally skipped because the collection will be missing — that is
    // intentional; run the full suite to exercise this path.

    // ── Navigate to the comics library ───────────────────────────────────────
    await page.goto('/comics');

    await expect(page.getByRole('heading', { name: 'E2E Coll Series B' })).toBeVisible({
      timeout: 10000,
    });

    // ── Open Series B's card ⋮ menu ──────────────────────────────────────────
    const seriesBArticle = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'E2E Coll Series B' }),
    });
    await seriesBArticle.getByRole('button', { name: 'Open menu' }).click();

    // ── Click "Add to collection" ─────────────────────────────────────────────
    await page.getByRole('menuitem', { name: 'Add to collection' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    // Search for the existing collection by typing its name.
    const nameInput = page.getByPlaceholder('Search collections…');
    await nameInput.fill('E2E Collection');

    // Wait for the debounced result to appear in the list.
    const existingCollectionBtn = page.getByRole('button', { name: /E2E Collection/ }).first();
    await expect(existingCollectionBtn).toBeVisible({ timeout: 5000 });

    // Click the existing collection button (not the "Create new" one).
    await existingCollectionBtn.click();

    // t("collections.addSuccess") = "Added to collection"
    await expect(page.getByText(/Added to collection/)).toBeVisible({
      timeout: 10000,
    });

    // ── Verify Series B appears on the collection detail page ─────────────────
    // Navigate to the collections view and open "E2E Collection".
    await page.goto('/comics?view=collections');

    const collectionCard = page.getByRole('heading', { name: 'E2E Collection' });
    await expect(collectionCard).toBeVisible({ timeout: 10000 });
    await collectionCard.click();

    await page.waitForURL(/\/comics\/collections\//, { timeout: 10000 });

    // Both series should be present on the detail page.
    await expect(page.getByRole('heading', { name: 'E2E Coll Series A' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('heading', { name: 'E2E Coll Series B' })).toBeVisible({
      timeout: 10000,
    });
  });
});
