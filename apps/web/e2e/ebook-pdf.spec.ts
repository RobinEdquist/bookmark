/**
 * PDF ebook smoke (issue #115).
 *
 * Seeds a PDF-format ebook and checks detail UI. Full stream rendering needs a
 * real file on the library path; that is covered by backend stream tests and
 * the large-fixture generator docs.
 */

import { test, expect } from "@playwright/test";
import { createUser, adminUser, loginViaUI } from "./helpers/auth";
import { seedEbook, type SeededEbook } from "./helpers/seed";

test.describe("PDF ebook detail", () => {
  let ebook: SeededEbook;

  test.beforeAll(async () => {
    await createUser(adminUser);
    ebook = await seedEbook({
      title: "E2E PDF Textbook",
      authorName: "PDF Author",
      format: "pdf",
      pageCount: 42,
      fileName: "textbook.pdf",
    });
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, adminUser.email, adminUser.password);
  });

  test("shows PDF ebook detail and Read action", async ({ page }) => {
    await page.goto(`/ebooks/${ebook.id}`);
    await expect(
      page.getByRole("heading", { name: "E2E PDF Textbook" }),
    ).toBeVisible();
    await expect(page.getByText("PDF Author")).toBeVisible();
    const readControl = page.getByRole("link", { name: /Read/i });
    const readButton = page.getByRole("button", { name: /Read/i });
    await expect(readControl.or(readButton).first()).toBeVisible();
  });
});
