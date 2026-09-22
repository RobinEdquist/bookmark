#!/usr/bin/env node
/** Delegates to the backend generator (needs pdf-lib + @napi-rs/canvas). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendScript = resolve(
  here,
  "../../backend/scripts/generate-large-pdf-fixture.mjs",
);
const result = spawnSync(process.execPath, [backendScript, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
