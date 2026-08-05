# Dependency security overrides

`pnpm.overrides` in the root `package.json` pins patched versions of packages we
don't depend on directly. Every entry exists because a transitive dependency
pulled in a version with a published advisory and the direct parent had no
release that moved off it — bumping our own `dependencies` could not reach them.

Run `pnpm audit` after any lockfile change. It should report **no known
vulnerabilities**; anything else means a new advisory landed or an override
stopped applying.

## Why each entry is here

| Override                    | Reached through                                    | Notes                                                                                           |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `adm-zip@^0.6.0`            | `epub2`                                            | `epub2` asks for `^0.5.10`, which is inside the 4GB-allocation advisory. 0.6.0 is a major bump. |
| `brace-expansion@1/2/5`     | `minimatch` under `eslint`, `archiver`, `nest cli` | Three live majors in the tree, each with its own patched floor.                                 |
| `esbuild@<0.25.0 → ^0.25.0` | `drizzle-kit` → deprecated `@esbuild-kit/*`        | `@esbuild-kit/core-utils` pins `~0.18`. Drops when drizzle-kit moves to `tsx`.                  |
| `fast-uri@^3.1.5`           | `@nestjs/cli` → `ajv`                              | Patch-level, dev-only.                                                                          |
| `js-yaml@^5.2.2`            | `@nestjs/swagger`                                  | Patch-level, ships in the image.                                                                |
| `postcss@8 → ^8.5.23`       | `next` (pins `8.4.31`), `vite`                     | Next pins an exact version; only an override moves it.                                          |
| `sharp@^0.35.3`             | `next`                                             | `next` pins `0.34.5`; the backend already runs `0.35.x` directly.                               |
| `undici@7 → ^7.29.0`        | `cheerio`, `better-auth` → `vitest` → `jsdom`      | Two live majors, so two entries.                                                                |
| `undici@8 → ^8.9.0`         | `testcontainers`                                   | The backend's own `undici` is bumped in `apps/backend/package.json`.                            |

## Removing an override

Delete the entry, run `pnpm install && pnpm audit`. If the advisory doesn't come
back, the parent has caught up and the override was dead weight — keep it
deleted. The two worth revisiting first:

- **`adm-zip`** — crosses a major under `epub2`. Verified by parsing a real
  `.epub` end to end (metadata, spine, `getChapterAsync`, `getImage`). Re-run
  that check if the pin changes.
- **`esbuild`** — `drizzle-kit migrate` runs at container start
  (`docker-entrypoint.sh`), and it loads `drizzle.config.ts` through the
  overridden esbuild. Smoke test with `cd apps/backend && npx drizzle-kit generate`
  before trusting a change here.
