import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createUser, adminUser, loginViaUI } from "./helpers/auth";
import { seedEbook, type SeededEbook } from "./helpers/seed";

const fixture = new URL("./fixtures/reader.pdf", import.meta.url);

test.describe("PDF ebook reader", () => {
  let ebook: SeededEbook;

  test.beforeEach(async ({ page }) => {
    await createUser(adminUser);
    // Each test gets independent progress, including parallel browser projects.
    ebook = await seedEbook({
      title: "E2E PDF Textbook",
      authorName: "PDF Author",
      format: "pdf",
      pageCount: 4,
      fileName: "textbook.pdf",
    });
    await loginViaUI(page, adminUser.email, adminUser.password);
    await page.route(`**/api/ebooks/${ebook.id}/stream`, async (route) => {
      await route.fulfill({
        contentType: "application/pdf",
        body: await readFile(fixture),
      });
    });
  });

  test("renders a PDF and keeps both edges reachable when zoomed", async ({
    page,
  }) => {
    await page.goto(`/ebooks/${ebook.id}/read`);
    const canvas = page.locator(".react-pdf__Page__canvas");
    await expect(canvas).toBeVisible();
    await expect(
      page.getByText("Left edge. Page 1", { exact: true }),
    ).toBeAttached();
    await page.getByRole("button", { name: "Fit width", exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    }
    await expect(page.getByText("200%", { exact: true })).toBeVisible();
    const viewport = page.getByTestId("pdf-viewport");
    await expect
      .poll(async () =>
        viewport.evaluate((el) => {
          const pageCanvas = el.querySelector("canvas")!;
          const bounds = pageCanvas.getBoundingClientRect();
          const view = el.getBoundingClientRect();
          return bounds.width > view.width && bounds.left >= view.left;
        }),
      )
      .toBe(true);
    await viewport.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect
      .poll(async () =>
        viewport.evaluate(
          (el) =>
            el.querySelector("canvas")!.getBoundingClientRect().right <=
            el.getBoundingClientRect().right,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Go to page" })).toHaveValue(
      "2",
    );
  });

  test("Escape cancels page editing and committed pages survive reopening", async ({
    page,
  }) => {
    await page.goto(`/ebooks/${ebook.id}/read`);
    await expect(page.locator(".react-pdf__Page__canvas")).toBeVisible();
    const field = page.getByRole("textbox", { name: "Go to page" });
    await field.fill("3");
    await field.press("Escape");
    await expect(field).toHaveValue("1");
    await expect(
      page.getByText("Left edge. Page 1", { exact: true }),
    ).toBeAttached();

    // A subsequent intentional commit must still work after cancellation.
    await field.fill("2");
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/ebook-progress/${ebook.id}`) &&
        response.request().method() === "PATCH" &&
        response.request().postDataJSON().cfi === "page:2" &&
        response.ok(),
    );
    await field.press("Enter");
    await saved;
    await page.reload();
    await expect(field).toHaveValue("2");
    await expect(
      page.getByText("Left edge. Page 2", { exact: true }),
    ).toBeAttached();

    // Ordinary blur also commits, without leaking the cancellation flag.
    await field.fill("3");
    await field.press("Tab");
    await expect(
      page.getByText("Left edge. Page 3", { exact: true }),
    ).toBeAttached();
  });

  test("an unreadable PDF retains an actionable error and Close control", async ({
    page,
  }) => {
    await page.goto(`/ebooks/${ebook.id}`);
    const readButton = page.getByRole("link", { name: "Read", exact: true });
    await expect(readButton).toBeVisible();
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await page.route(`**/api/ebooks/${ebook.id}/stream`, (route) =>
      route.fulfill({
        contentType: "application/pdf",
        body: "not a PDF",
      }),
    );
    await readButton.click();
    await expect(
      page.getByText(
        "This PDF could not be opened. The file may be corrupt or unreadable.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close reader", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/ebooks/${ebook.id}$`));
    expect(errors).toEqual([]);
  });
});
