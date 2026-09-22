import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Issue #115: streaming range requests go through the Next.js `/api` rewrite
 * to the backend unchanged. This guards the proxy contract the frontend
 * reader relies on (`/api/ebooks/:id/stream`).
 */
describe("Next.js API proxy rewrite", () => {
  it("rewrites /api/:path* to the backend API_URL", () => {
    const config = readFileSync(
      resolve(__dirname, "../../next.config.js"),
      "utf8",
    );
    expect(config).toContain('source: "/api/:path*"');
    expect(config).toContain("destination:");
    expect(config).toContain("/api/:path*");
    expect(config).toMatch(/API_URL/);
  });
});
