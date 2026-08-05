# Bookmark

A self-hosted home for your audiobooks — and, since they live on the same shelf anyway, your ebooks and comics too.

Most self-hosted media servers treat audiobooks as an afterthought: music with an unusually long runtime, no real chapter handling, progress that resets the moment you switch devices. Bookmark starts from the opposite assumption. Audiobooks come first here. Chapters work properly, your position follows you everywhere, and the player is built around how people actually listen — speed control, skip back when you zone out, a sleep timer for the last chapter of the night.

Once that part was solid, ebooks and comics were a small leap rather than a separate project. So if audiobooks are your main thing, Bookmark should be the obvious choice. And if you'd rather not run three different servers for the rest of your library, it's a genuinely good place to keep your ebooks and comics as well.

Point it at the folders you already have. It scans them, fills in covers and metadata, and never rewrites your original files.

## What you get

**Audiobooks** are the heart of it. Stream straight from the browser with full M4B chapter support, variable playback speed, skip controls, and a sleep timer. Your progress syncs to the server every few seconds, so you can start on your laptop and pick up exactly where you left off on your phone.

**Ebooks** are scanned from your EPUB collection and can be read right in the browser, with your position saved as you go. They're also exposed through an OPDS feed, so you can keep using whatever OPDS-compatible reader app you already prefer.

**Comics** are organized the way you'd expect: series and issues, including TPBs, omnibuses, and one-shots, scanned folder-by-folder from CBZ, CBR, and PDF archives. Metadata comes from embedded `ComicInfo.xml` and Comic Vine. You can browse, organize, and download today; the in-browser reader is still to come.

Beyond the media itself:

- **Metadata that fills itself in** — covers and chapters pulled from your files, enriched by Hardcover and Audnexus for books and Comic Vine for comics.
- **Multiple users** — everyone gets their own progress, lists, and preferences, with per-user permissions for editing metadata, uploading, or issuing API keys. Tag-based filters can keep certain content out of certain accounts.
- **SSO** — optional OpenID Connect, so it slots into an existing Authentik / Keycloak / Authelia setup.
- **Live updates** — scans and imports report progress over WebSocket instead of making you refresh.
- **A REST API** — documented with an OpenAPI spec, intended to keep the door open for native mobile apps later.
- **Yours to make your own** — light and dark themes, custom accent colors, and currently shipping in English and Swedish (more translations very welcome).

It's honest about where it is, too. The AudiobookShelf importer wants more real-world mileage before anyone calls it stable, and the API — fully documented, but young — can still change shape between releases. The [roadmap](#roadmap) is the source of truth.

## Tech stack

It's a TypeScript monorepo (Turborepo + pnpm). Bookmark itself is two apps — the web app and the API, which is what the table below describes — alongside a third, the static marketing site, which is never part of a deployment.

| Area           | Built with                                                          |
| -------------- | ------------------------------------------------------------------- |
| Web app        | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query   |
| API            | NestJS 11, PostgreSQL, Drizzle ORM                                  |
| Auth           | Better Auth — sessions, API keys, and optional OIDC                 |
| Real-time      | Socket.IO                                                           |
| Media handling | FFmpeg (audio + chapters), Sharp (covers), pdf.js, node-unrar, EPUB |
| i18n           | next-intl (English + Swedish)                                       |

The frontend talks to the API over a Next.js proxy, which keeps the same setup working for a future mobile client. Covers and metadata are processed in background workers so a big first scan doesn't block the app.

## Running it

The quickest path is Docker. Bookmark ships as a single image — web app, API, and database together — so it's one container and one command, with no database to set up. If you'd rather use a Postgres server you already run, [point it at one](#using-your-own-postgres). You'll need Docker and Docker Compose; for local development you'll also want Node.js 20+, PostgreSQL 18, pnpm 9+, and FFmpeg.

```bash
git clone https://github.com/RobinEdquist/bookmark.git
cd bookmark

# Pre-built image, exposes port 3001
docker compose up -d

# Or build from source
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

That's it for a local try-out — an auth secret is generated on first start, and everything defaults to `http://localhost:3001`. For a real deployment (your own domain, media folders), copy the config template and fill in the essentials:

```bash
cp example.env .env
```

```env
PUBLIC_URL=https://bookmark.yourdomain.com

# Your timezone, so dates and times match your clock (defaults to UTC in Docker)
TZ=Europe/Stockholm

# Your media (read-only mounts — Bookmark never writes to them)
AUDIOBOOK_LIBRARY_PATH=/path/to/your/audiobooks
EBOOK_LIBRARY_PATH=/path/to/your/ebooks
COMIC_LIBRARY_PATH=/path/to/your/comics
```

A container doesn't inherit the timezone of the machine it runs on, so without `TZ` everything is timestamped in UTC. To copy the host's zone straight into your `.env` instead of looking it up:

```bash
echo "TZ=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')" >> .env
```

Visit `http://localhost:3001` (or your domain). The first account you create becomes the admin. From there, head to **Settings → Libraries**, point Bookmark at your folders, hit **Scan**, and you're set.

### Configuration

Everything is set through environment variables in your `.env` file. With Docker, a few internal values (the database URL, the internal service URLs) are derived for you, so the lists below are the variables you actually touch.

**Core**

| Variable             | Required          | Default                 | Description                                                                                           |
| -------------------- | ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`         | For remote access | `http://localhost:3001` | Full URL where Bookmark is reachable; used for auth and CORS                                          |
| `BETTER_AUTH_SECRET` | No                | auto-generated          | Secret for signing sessions; generated and persisted in the data volume on first start if unset       |
| `DATABASE_URL`       | No                | built-in database       | Postgres connection string. Unset means Bookmark runs its own — see [below](#using-your-own-postgres) |
| `PORT`               | No                | `3001`                  | Host port the web app is published on                                                                 |
| `LOG_LEVEL`          | No                | `info`                  | Backend log verbosity (`debug`, `info`, `warn`, `error`)                                              |
| `TZ`                 | No                | `UTC`                   | Timezone for displayed dates and times, as an IANA zone name (e.g. `Europe/Stockholm`)                |

**Media and storage**

| Variable                 | Required | Default              | Description                               |
| ------------------------ | -------- | -------------------- | ----------------------------------------- |
| `DATA_PATH`              | No       | `./data`             | Host path for app data (database, covers) |
| `AUDIOBOOK_LIBRARY_PATH` | No       | `./media/audiobooks` | Your audiobook folder (mounted read-only) |
| `EBOOK_LIBRARY_PATH`     | No       | `./media/ebooks`     | Your ebook folder (mounted read-only)     |
| `COMIC_LIBRARY_PATH`     | No       | `./media/comics`     | Your comic folder (mounted read-only)     |

**Single sign-on (optional)** — leave `OIDC_ENABLED=false` to use the built-in email/password login.

| Variable             | Required       | Default | Description                            |
| -------------------- | -------------- | ------- | -------------------------------------- |
| `OIDC_ENABLED`       | No             | `false` | Turn OpenID Connect SSO on or off      |
| `OIDC_ISSUER_URL`    | If SSO enabled | —       | Issuer URL from your identity provider |
| `OIDC_CLIENT_ID`     | If SSO enabled | —       | Client ID                              |
| `OIDC_CLIENT_SECRET` | If SSO enabled | —       | Client secret                          |

**AI-narrated audiobooks (optional)** — Bookmark can narrate an ebook into a real audiobook using any OpenAI-compatible text-to-speech server (`/v1/audio/speech`). A ready-to-use, CPU-friendly engine ships behind a compose profile.

Generated files are written to `DATA_PATH/generated-audiobooks` and surface inside the audiobook library as a `generated` folder, which needs its own writable mount — your own media stays read-only. That mount is commented out in `docker-compose.yml` by default, because Docker cannot create a mountpoint inside a read-only mount and the container won't start if the folder is missing. So create it first, then uncomment the mount:

```bash
mkdir -p "$AUDIOBOOK_LIBRARY_PATH/generated"   # then uncomment the mount in docker-compose.yml
docker compose --profile tts up -d
```

Then enter `http://tts:8880` as the server URL under **Settings → Integrations → Text-to-speech** — no env vars needed. Prefer a different engine, voice, or language? Point the server URL at any other OpenAI-compatible TTS server, self-hosted or cloud, and it works as a drop-in replacement.

**Content requests (optional)** — Bookmark can let users search an external catalog and request titles that aren't in the library yet, with an admin approval flow. The searching and downloading itself is handled by a **content request module** — a separate HTTP service you run alongside Bookmark. Point Bookmark at one, then enable requests under **Settings**. Want to build a module? See the [developer guide](docs/content-request-modules.md) and the [OpenAPI spec](docs/api/content-request-module.openapi.yaml) it must implement.

| Variable                 | Required            | Default | Description                                     |
| ------------------------ | ------------------- | ------- | ----------------------------------------------- |
| `TRACKER_CLIENT_URL`     | If requests enabled | —       | Base URL of your content request module         |
| `TRACKER_CLIENT_API_KEY` | If requests enabled | —       | Shared secret the module expects as `X-API-Key` |

**Image** — which Bookmark image `docker compose up` runs. Ignored when building from source with `docker-compose.build.yml`. The `latest` tag tracks the newest release; `edge` follows the main branch and is not release-tested.

| Variable         | Required | Default                                | Description                    |
| ---------------- | -------- | -------------------------------------- | ------------------------------ |
| `BOOKMARK_IMAGE` | No       | `ghcr.io/robinedquist/bookmark:latest` | Full image reference to deploy |

**Update checks (optional)** — every 6 hours Bookmark asks GitHub whether a newer release exists and marks the sidebar if so. It's a plain request for a public release list: no telemetry, and nothing about your instance or library is sent. It is still an outbound call, so you can turn it off.

| Variable               | Required | Default                 | Description                                            |
| ---------------------- | -------- | ----------------------- | ------------------------------------------------------ |
| `UPDATE_CHECK_ENABLED` | No       | `true`                  | Set to `false` to never contact GitHub                 |
| `UPDATE_CHECK_REPO`    | No       | `RobinEdquist/bookmark` | Repository to check releases against; useful for forks |

### The database

Bookmark runs its own PostgreSQL inside the container and keeps it in the app data volume at `/data/db`. You don't configure it, and there's no password: the server listens on a Unix socket that only exists inside the container, with no network port at all. To poke around:

```bash
docker exec -it bookmark psql -U bookmark bookmark
```

One constraint: **the app data volume has to be on local disk.** Postgres needs file locking and fsync guarantees that SMB shares don't provide, so Bookmark refuses to start if `DATA_PATH` lands on one. Your media mounts can live on a NAS — this can't. (NFS gets a warning rather than a refusal; it can work with the right mount options, but local disk is the safe choice.)

#### Backups

**Copying `data/app` while Bookmark is running does not give you a restorable database.** A file-level copy of a live Postgres cluster can catch it mid-write. Take a real dump instead:

```bash
docker exec bookmark pg_dump -U bookmark bookmark > bookmark-$(date +%F).sql
```

To restore into a fresh instance:

```bash
docker exec -i bookmark psql -U bookmark bookmark < bookmark-2026-08-05.sql
```

Covers and cache under `data/app` are plain files and copy fine at any time. Stopping the container first also makes a whole-folder copy safe.

#### Using your own Postgres

Set `DATABASE_URL` and the built-in server never starts — Bookmark connects out instead, exactly as it always has:

```env
DATABASE_URL=postgresql://bookmark:password@db.example.com:5432/bookmark
```

Create an empty database and a user that owns it; Bookmark applies its own schema on first start. The user needs permission to create extensions (search uses `pg_trgm`).

Running one in Compose alongside Bookmark:

```yaml
services:
  postgres:
    image: postgres:18-trixie
    restart: unless-stopped
    environment:
      POSTGRES_USER: bookmark
      POSTGRES_PASSWORD: pick-something-strong
      POSTGRES_DB: bookmark
    volumes:
      # Postgres 18 moved this up from /var/lib/postgresql/data
      - ./data/postgres:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bookmark -d bookmark"]
      interval: 10s
      timeout: 5s
      retries: 5

  bookmark:
    depends_on:
      postgres:
        condition: service_healthy
```

with `DATABASE_URL=postgresql://bookmark:pick-something-strong@postgres:5432/bookmark` in your `.env`.

**Moving between the two:** `pg_dump` from wherever the data is now, then restore into the other. Going from your own server to the built-in one, unset `DATABASE_URL`, start Bookmark so it creates the database, then pipe the dump into `docker exec -i bookmark psql -U bookmark bookmark`.

#### Running without Docker

If you start the apps directly (see [Development](#development)), the Docker-derived values aren't set for you — point the services at each other with these. Note that the built-in database lives inside the container, so running outside Docker means `DATABASE_URL` is **required** and you supply the Postgres yourself:

| Variable              | Service | Description                                                           |
| --------------------- | ------- | --------------------------------------------------------------------- |
| `DATABASE_URL`        | API     | Postgres connection string (required outside Docker)                  |
| `BETTER_AUTH_URL`     | API     | Base URL auth callbacks are built from (e.g. `http://localhost:3000`) |
| `UI_URL`              | API     | Frontend origin, for CORS (e.g. `http://localhost:3001`)              |
| `APP_DATA_PATH`       | API     | Where covers and cache are written (required in production)           |
| `API_URL`             | Web     | Backend URL the web app proxies to (e.g. `http://localhost:3000`)     |
| `NEXT_PUBLIC_API_URL` | Web     | Backend URL exposed to the browser                                    |

Both `BETTER_AUTH_URL` and `UI_URL` are addresses a **browser** uses, never the port the API happens to bind to. In Docker that makes them the same value — the web app proxies `/api` through to the backend, so port 3000 is never reached directly and `docker-compose.yml` sets both from `PUBLIC_URL`. Running the apps directly is the one setup where they differ, because the API is then reachable on its own port.

`NODE_ENV` follows the usual Node convention and is set for you in Docker; `DEBUG` only adds verbose output to the end-to-end tests.

### Supported formats

- **Audiobooks** — M4B (with chapters), MP3, M4A/AAC, OGG/Opus
- **Ebooks** — EPUB
- **Comics** — CBZ, CBR, PDF

## Roadmap

What's actually next, and what's honestly unfinished. Roughly in the order it's likely to land.

**Next up**

- **Automatic backups** — the database, covers, and settings on a schedule, from inside the app. Today a correct backup means stopping the stack before copying `DATA_PATH`, or taking a `pg_dump` by hand; neither belongs in a self-hosted product's setup guide.

**In progress**

- **AudiobookShelf import** — brings a library across from AudiobookShelf, including per-user progress. It works; what it hasn't had yet is mileage on libraries other than the ones it was built against. Calling it stable needs that feedback first, so if you migrate, reports of what did and didn't survive are genuinely useful.
- **The REST API** — The api has an OpenAPI spec, browsable through Swagger UI. It just isn't being called stable yet: names and shapes can still change between releases, and some aren't truly correct at the moment, therefore work in progress.

**Later**

- **Comics reader** — in-browser reading for comics. Browsing, organizing, and downloading work now; reading in the app doesn't.
- **Comic read lists** — ordered sequences that cut across series, the way crossover events are actually read.
- **More translations** — English and Swedish ship today, and the groundwork is there for any number more. Contributions very welcome.

Nothing here has a date attached. It's a spare-time project, and the list reflects intent rather than a commitment. Feel free to propose other additions or changes that you feel could improve the application.

## Development

```bash
pnpm install
cp example.env .env

# a Postgres to develop against, on :55432 to avoid clashing with a local one
docker compose -f docker-compose.dev.yml up -d

# apply the schema
cd apps/backend && pnpm db:migrate && cd ../..

pnpm dev                     # web on :3001, API on :3000
```

The dev database matches `DATABASE_URL` in `apps/backend/.env`. It's a separate file rather than `docker-compose.override.yml` because Compose auto-loads that name, which would attach a database to every `docker compose up -d` — including a hoster's.

Useful scripts:

```bash
pnpm build            # build everything
pnpm lint             # lint everything
pnpm check-types      # type-check everything
pnpm test             # unit tests
pnpm test:e2e         # end-to-end tests
```

Swagger UI lives at `http://localhost:3000/api/docs` once the backend is up, and the raw OpenAPI document at `http://localhost:3000/api/docs-json` (or `pnpm --filter backend openapi:export` to write it to a file). The repo is laid out as `apps/web` (Next.js), `apps/backend` (NestJS), and `apps/website` (the static marketing site, dev server on :3002), with shared code under `packages/`.

## Thanks to

- [Hardcover](https://hardcover.app) for book metadata and ratings
- [Comic Vine](https://comicvine.gamespot.com) for comic series and issue metadata (used under its non-commercial terms)
- [Audnexus](https://github.com/laxamentumtech/audnexus) for extra audiobook metadata
- [FFmpeg](https://www.ffmpeg.org/) for the heavy lifting on media

## License

[MIT](LICENSE) © Robin Edquist
