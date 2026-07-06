import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/*.d.ts",
        "**/index.{ts,tsx}",
        "**/__tests__/**",
        "**/__test-utils__/**",
        "vitest.setup.ts",
        "next-env.d.ts",
        "next.config.*",
        "postcss.config.*",
        "playwright.config.*",
        "eslint.config.*",
        "i18n/config.ts",
        "lib/query-keys.ts",
        "lib/theme-config.ts",
        "lib/constants/**",
        "messages/**",
        "public/**",
        "app/fonts/**",
        "lib/foliate-js/**",
        "**/migrations/**",
        "coverage/**",
        ".next/**",
        "node_modules/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
