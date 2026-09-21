/**
 * Playwright global setup.
 *
 * Starts PostgreSQL (testcontainers), backend server, and Next.js dev server.
 * Reuses the same pattern as the backend E2E test setup.
 */

/* eslint-disable turbo/no-undeclared-env-vars */
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { spawnSync, spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BACKEND_URL = process.env.E2E_API_URL ?? "http://localhost:3000";
const FRONTEND_URL = process.env.E2E_WEB_URL ?? "http://localhost:3001";
const backendDir = resolve(__dirname, "../../backend");
const frontendDir = resolve(__dirname, "..");

declare global {
  var __PW_POSTGRES_CONTAINER__: StartedPostgreSqlContainer;
  var __PW_BACKEND_PROCESS__: ChildProcess;
  var __PW_FRONTEND_PROCESS__: ChildProcess;
}

async function waitForServer(
  url: string,
  name: string,
  maxSeconds = 60,
): Promise<void> {
  for (let i = 0; i < maxSeconds; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        console.log(`  ✅ ${name} is ready`);
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${name} failed to start within ${maxSeconds}s`);
}

export default async function globalSetup() {
  console.log("\n🎭 Playwright Global Setup\n");

  // 1. Start PostgreSQL
  console.log("🐘 Starting PostgreSQL container...");
  const container = await new PostgreSqlContainer("postgres:18")
    .withDatabase("bookmark_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const connectionUri = container.getConnectionUri();
  console.log(`  ✅ PostgreSQL started at ${connectionUri}`);
  global.__PW_POSTGRES_CONTAINER__ = container;

  // Expose DATABASE_URL to test workers for seeding
  process.env.DATABASE_URL = connectionUri;

  const env = {
    ...process.env,
    DATABASE_URL: connectionUri,
    PORT: new URL(BACKEND_URL).port,
    APP_DATA_PATH: mkdtempSync(resolve(tmpdir(), "bookmark-e2e-")),
    LIBRARY_PATH: "",
    EBOOK_LIBRARY_PATH: "",
    COMIC_LIBRARY_PATH: "",
    NODE_ENV: "test" as const,
    BETTER_AUTH_SECRET: "test-secret-for-ci-only",
    BETTER_AUTH_URL: BACKEND_URL,
    UI_URL: FRONTEND_URL,
  };

  // 2. Run migrations
  console.log("📦 Running database migrations...");
  const migrateResult = spawnSync("npx", ["drizzle-kit", "migrate"], {
    cwd: backendDir,
    env,
    stdio: "inherit",
  });
  if (migrateResult.status !== 0) {
    await container.stop();
    throw new Error("Migration failed");
  }
  console.log("  ✅ Migrations completed");

  // 3. Build + start backend
  console.log("🔨 Building backend...");
  const buildResult = spawnSync("pnpm", ["build"], {
    cwd: backendDir,
    env,
    stdio: "inherit",
  });
  if (buildResult.status !== 0) {
    await container.stop();
    throw new Error("Backend build failed");
  }

  console.log("🚀 Starting backend server...");
  const backendProcess = spawn("node", ["dist/src/main.js"], {
    cwd: backendDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  global.__PW_BACKEND_PROCESS__ = backendProcess;

  backendProcess.stdout?.on("data", (chunk: Buffer) => {
    if (process.env.DEBUG) console.log("[backend]", chunk.toString().trim());
  });
  backendProcess.stderr?.on("data", (chunk: Buffer) => {
    if (process.env.DEBUG)
      console.error("[backend:err]", chunk.toString().trim());
  });

  await waitForServer(`${BACKEND_URL}/api/health`, "Backend");

  // 4. Start Next.js dev server
  console.log("🌐 Starting frontend dev server...");
  const frontendProcess = spawn(
    "pnpm",
    ["exec", "next", "dev", "--port", new URL(FRONTEND_URL).port],
    {
      cwd: frontendDir,
      env: { ...env, API_URL: BACKEND_URL },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ) as ChildProcess;
  global.__PW_FRONTEND_PROCESS__ = frontendProcess;

  frontendProcess.stdout?.on("data", (chunk: Buffer) => {
    if (process.env.DEBUG) console.log("[frontend]", chunk.toString().trim());
  });
  frontendProcess.stderr?.on("data", (chunk: Buffer) => {
    if (process.env.DEBUG)
      console.error("[frontend:err]", chunk.toString().trim());
  });

  await waitForServer(FRONTEND_URL, "Frontend");
  console.log("\n🎭 Setup complete — running tests\n");
}
