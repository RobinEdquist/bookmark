# Bookmark

A self-hosted server for your audiobooks, ebooks, and comics.

Bookmark is built for audiobooks first: full M4B chapter support, a player with speed control, skip buttons, and a sleep timer, and progress that syncs across devices. Ebooks and comics share the same library. Point it at the folders you already have; covers and metadata are read from your files, and the originals are never modified.

## Features

- **Audiobooks** — stream in the browser with chapter support, variable playback speed, skip controls, and a sleep timer. Progress saves every few seconds, so you can switch devices and continue where you left off.
- **Ebooks** — read EPUBs in the browser with your position saved, or over OPDS with the reader app you already use.
- **Comics** — series and issues, including TPBs, omnibuses, and one-shots. Browse, organize, and download; an in-browser reader is planned.
- **Metadata** — covers, chapters, and embedded tags come from the files themselves; descriptions, ratings, and series info can be matched from Goodreads, Hardcover, Audible, and Comic Vine.
- **AI narration** — generate an M4B audiobook from an ebook, using any OpenAI-compatible text-to-speech server. A ready-to-run engine ships in the compose file.
- **Multiple users** — per-user progress, lists, and preferences, with permissions for editing metadata, uploading, and API keys, plus tag-based content filters.
- **Single sign-on** — optional OpenID Connect (Authentik, Keycloak, Authelia).
- **Live updates** — scans and imports report progress over WebSocket.
- **REST API** — documented with an OpenAPI spec and Swagger UI.
- **Interface** — light and dark themes, custom accent colors, English and Swedish.

### Supported formats

- **Audiobooks** — M4B (with chapters), MP3, M4A/AAC, OGG/Opus
- **Ebooks** — EPUB
- **Comics** — CBZ, CBR, PDF

## Installation

Bookmark ships as a single Docker image: web app, API, and database in one container. You need Docker with Compose.

```bash
git clone https://github.com/RobinEdquist/bookmark.git
cd bookmark

# Pre-built image, exposes port 3001
docker compose up -d

# Or build from source
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

For a local try-out that is it: an auth secret is generated on first start and everything defaults to `http://localhost:3001`. For a real deployment, copy the config template and fill in the essentials:

```bash
cp example.env .env
```

```env
PUBLIC_URL=https://bookmark.yourdomain.com

# Your timezone, so dates and times match your clock (defaults to UTC in Docker)
TZ=Europe/Stockholm

# Your media (read-only mounts; Bookmark never writes to them)
AUDIOBOOK_LIBRARY_PATH=/path/to/your/audiobooks
EBOOK_LIBRARY_PATH=/path/to/your/ebooks
COMIC_LIBRARY_PATH=/path/to/your/comics
```

Open `http://localhost:3001` (or your domain) and sign up; the first account becomes the admin. Point Bookmark at your folders under **Settings → Libraries** and start a scan.

To use a Postgres server you already run instead of the built-in one, see [Using your own Postgres](#using-your-own-postgres).

## Configuration

Everything is set through environment variables in your `.env` file. With Docker, internal values (the database URL, internal service URLs) are derived for you; the tables below are the variables you actually touch.

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

**AI-narrated audiobooks (optional)** — works with any OpenAI-compatible text-to-speech server (`/v1/audio/speech`); a CPU-friendly engine ships behind a compose profile. Generated files surface in the audiobook library as a `generated` folder, which needs its own writable mount. Create the folder first (Docker cannot create a mountpoint inside a read-only mount), then uncomment the mount in `docker-compose.yml`:

```bash
mkdir -p "$AUDIOBOOK_LIBRARY_PATH/generated"
docker compose --profile tts up -d
```

Enter `http://tts:8880` as the server URL under **Settings → Integrations → Text-to-speech**. Any other OpenAI-compatible TTS server, self-hosted or cloud, works as a drop-in replacement.

**Content requests (optional)** — users can search an external catalog and request titles that are not in the library yet, with an admin approval flow. Searching and downloading is handled by a content request module: a separate HTTP service you run alongside Bookmark. See the [developer guide](docs/content-request-modules.md) and the [OpenAPI spec](docs/api/content-request-module.openapi.yaml) it must implement.

| Variable                 | Required            | Default | Description                                     |
| ------------------------ | ------------------- | ------- | ----------------------------------------------- |
| `TRACKER_CLIENT_URL`     | If requests enabled | —       | Base URL of your content request module         |
| `TRACKER_CLIENT_API_KEY` | If requests enabled | —       | Shared secret the module expects as `X-API-Key` |

**Image** — which image `docker compose up` runs. Ignored when building from source. The `latest` tag tracks the newest release; `edge` follows the main branch and is not release-tested.

| Variable         | Required | Default                                | Description                    |
| ---------------- | -------- | -------------------------------------- | ------------------------------ |
| `BOOKMARK_IMAGE` | No       | `ghcr.io/robinedquist/bookmark:latest` | Full image reference to deploy |

**Update checks (optional)** — Bookmark asks GitHub every 6 hours whether a newer release exists and marks the sidebar if so. It is a plain request for a public release list; nothing about your instance or library is sent.

| Variable               | Required | Default                 | Description                                            |
| ---------------------- | -------- | ----------------------- | ------------------------------------------------------ |
| `UPDATE_CHECK_ENABLED` | No       | `true`                  | Set to `false` to never contact GitHub                 |
| `UPDATE_CHECK_REPO`    | No       | `RobinEdquist/bookmark` | Repository to check releases against; useful for forks |

## Database

Bookmark runs its own PostgreSQL inside the container and keeps it in the app data volume at `/data/db`. There is nothing to configure and no password: the server listens on a Unix socket that only exists inside the container. To poke around:

```bash
docker exec -it bookmark psql -U bookmark bookmark
```

**The app data volume has to be on local disk.** Postgres needs file locking and fsync guarantees that SMB shares do not provide, so Bookmark refuses to start if `DATA_PATH` lands on one. Media mounts can live on a NAS; this cannot. NFS gets a warning rather than a refusal, but local disk is the safe choice.

### Backups

Admins can configure automatic backups under **Settings → Backups**. Bookmark creates a `.bookmark` archive containing a consistent PostgreSQL dump, cover and people images managed by Bookmark, and the persisted authentication secret. Library media, generated audiobooks, caches, temporary files, and other backup archives are not included.

The default location is `/data/backups`, inside the app data volume. You can select another writable container path in settings, set `BACKUP_PATH` to lock the path at startup, or mount a separate volume if backups should live on another disk. Scheduled backups use the timezone from `TZ`; retention cleanup runs only after a new backup succeeds.

The same page can create, upload, download, delete, and restore archives. Restoring replaces the current database and managed images, then restarts Bookmark. It never changes files in the configured library folders.

For a manual database-only backup, use `pg_dump`. A file-level copy of `data/app` while Bookmark is running can catch Postgres mid-write and is not a restorable database backup:

```bash
docker exec bookmark pg_dump -U bookmark bookmark > bookmark-$(date +%F).sql
```

Restore into a fresh instance:

```bash
docker exec -i bookmark psql -U bookmark bookmark < bookmark-2026-08-05.sql
```

Covers and cache under `data/app` are plain files and copy fine at any time. Stopping the container first also makes a whole-folder copy safe.

### Using your own Postgres

Set `DATABASE_URL` and the built-in server never starts; Bookmark connects out instead:

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

To move between the two, `pg_dump` from wherever the data is now and restore into the other. Going from your own server to the built-in one: unset `DATABASE_URL`, start Bookmark so it creates the database, then pipe the dump into `docker exec -i bookmark psql -U bookmark bookmark`.

### Running without Docker

If you start the apps directly (see [Development](#development)), the Docker-derived values are not set for you, and the built-in database is not available: `DATABASE_URL` is required and you supply the Postgres yourself.

| Variable              | Service | Description                                                           |
| --------------------- | ------- | --------------------------------------------------------------------- |
| `DATABASE_URL`        | API     | Postgres connection string (required outside Docker)                  |
| `BETTER_AUTH_URL`     | API     | Base URL auth callbacks are built from (e.g. `http://localhost:3000`) |
| `UI_URL`              | API     | Frontend origin, for CORS (e.g. `http://localhost:3001`)              |
| `APP_DATA_PATH`       | API     | Where covers and cache are written (required in production)           |
| `API_URL`             | Web     | Backend URL the web app proxies to (e.g. `http://localhost:3000`)     |
| `NEXT_PUBLIC_API_URL` | Web     | Backend URL exposed to the browser                                    |

`BETTER_AUTH_URL` and `UI_URL` are addresses a browser uses, never the port the API binds to. In Docker both are set from `PUBLIC_URL`; outside Docker they differ, because the API is then reachable on its own port.

## Roadmap

Roughly in the order it is likely to land. Nothing has a date attached: it is a spare-time project, and the list reflects intent rather than commitment. Proposals and contributions are welcome.

**Next up**

- **Automatic backups** — the database, covers, and settings on a schedule, from inside the app.

**In progress**

- **AudiobookShelf import** — brings a library across from AudiobookShelf, including per-user progress. It works, but needs mileage on more libraries before it is called stable; migration reports are welcome.
- **REST API stability** — the API has an OpenAPI spec and Swagger UI, but names and shapes can still change between releases.

**Later**

- **Comics reader** — in-browser reading. Browsing, organizing, and downloading already work.
- **Comic read lists** — ordered sequences that cut across series, the way crossover events are read.
- **More translations** — English and Swedish ship today; the groundwork is there for more.

## Development

A TypeScript monorepo (Turborepo + pnpm): `apps/web` (Next.js), `apps/backend` (NestJS), and `apps/website` (the static marketing site, never part of a deployment), with shared code under `packages/`.

| Area           | Built with                                                          |
| -------------- | ------------------------------------------------------------------- |
| Web app        | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query   |
| API            | NestJS 11, PostgreSQL, Drizzle ORM                                  |
| Auth           | Better Auth — sessions, API keys, and optional OIDC                 |
| Real-time      | Socket.IO                                                           |
| Media handling | FFmpeg (audio + chapters), Sharp (covers), pdf.js, node-unrar, EPUB |
| i18n           | next-intl (English + Swedish)                                       |

You need Node.js 20+, pnpm 9+, FFmpeg, and Docker:

```bash
pnpm install
cp example.env .env

# a Postgres to develop against, on :55432 to avoid clashing with a local one
docker compose -f docker-compose.dev.yml up -d

# apply the schema
cd apps/backend && pnpm db:migrate && cd ../..

pnpm dev                     # web on :3001, API on :3000
```

Useful scripts:

```bash
pnpm build            # build everything
pnpm lint             # lint everything
pnpm check-types      # type-check everything
pnpm test             # unit tests
pnpm test:e2e         # end-to-end tests
```

Swagger UI lives at `http://localhost:3000/api/docs` once the backend is up, and the raw OpenAPI document at `http://localhost:3000/api/docs-json` (or `pnpm --filter backend openapi:export` to write it to a file).

## Thanks to

- [Hardcover](https://hardcover.app) for book metadata and ratings
- [Comic Vine](https://comicvine.gamespot.com) for comic series and issue metadata (used under its non-commercial terms)
- [Audnexus](https://github.com/laxamentumtech/audnexus) for extra audiobook metadata
- [FFmpeg](https://www.ffmpeg.org/) for the heavy lifting on media

## License

[MIT](LICENSE) © Robin Edquist
