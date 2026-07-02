# Bookmark

A self-hosted home for your audiobooks — and, since they live on the same shelf anyway, your ebooks and comics too.

Most self-hosted media servers treat audiobooks as an afterthought: music with an unusually long runtime, no real chapter handling, progress that resets the moment you switch devices. Bookmark starts from the opposite assumption. Audiobooks come first here. Chapters work properly, your position follows you everywhere, and the player is built around how people actually listen — speed control, skip back when you zone out, a sleep timer for the last chapter of the night.

Once that part was solid, ebooks and comics were a small leap rather than a separate project. So if audiobooks are your main thing, Bookmark should be the obvious choice. And if you'd rather not run three different servers for the rest of your library, it's a genuinely good place to keep your ebooks and comics as well.

Point it at the folders you already have. It scans them, fills in covers and metadata, and never rewrites your original files.

## What you get

**Audiobooks** are the heart of it. Stream straight from the browser with full M4B chapter support, variable playback speed, skip controls, and a sleep timer. Your progress syncs to the server every few seconds, so you can start on your laptop and pick up exactly where you left off on your phone.

**Ebooks** are scanned from your EPUB collection and exposed through an OPDS feed, so you can read them in whatever OPDS-compatible app you already use. (An in-browser reader is on the way — see the roadmap.)

**Comics** are organized the way you'd expect: series and issues, including TPBs, omnibuses, and one-shots, scanned folder-by-folder from CBZ, CBR, and PDF archives. Metadata comes from embedded `ComicInfo.xml` and Comic Vine. You can browse, organize, and download today; the in-browser reader is still to come.

Beyond the media itself:

- **Metadata that fills itself in** — covers and chapters pulled from your files, enriched by Hardcover and Audnexus for books and Comic Vine for comics.
- **Multiple users** — everyone gets their own progress, lists, and preferences, with per-user permissions for editing metadata, uploading, or issuing API keys. Tag-based filters can keep certain content out of certain accounts.
- **SSO** — optional OpenID Connect, so it slots into an existing Authentik / Keycloak / Authelia setup.
- **Live updates** — scans and imports report progress over WebSocket instead of making you refresh.
- **A REST API** — documented with Swagger, intended to keep the door open for native mobile apps later.
- **Yours to make your own** — light and dark themes, custom accent colors, and currently shipping in English and Swedish (more translations very welcome).

It's honest about where it is, too. A few things — Hardcover progress sync, the AudiobookShelf importer, and the full breadth of the API — are partially there and still being worked on. The roadmap below is the source of truth.

## Tech stack

It's a TypeScript monorepo (Turborepo + pnpm) with two apps.

| Area            | Built with                                                              |
| --------------- | ----------------------------------------------------------------------- |
| Web app         | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query       |
| API             | NestJS 11, PostgreSQL, Drizzle ORM                                      |
| Auth            | Better Auth — sessions, API keys, and optional OIDC                     |
| Real-time       | Socket.IO                                                               |
| Media handling  | FFmpeg (audio + chapters), Sharp (covers), pdf.js, node-unrar, EPUB     |
| i18n            | next-intl (English + Swedish)                                           |

The frontend talks to the API over a Next.js proxy, which keeps the same setup working for a future mobile client. Covers and metadata are processed in background workers so a big first scan doesn't block the app.

## Running it

The quickest path is Docker. Bookmark ships as a single image (web app + API together) plus a Postgres database — two containers, one command. You'll need Docker and Docker Compose; for local development you'll also want Node.js 20+, PostgreSQL 16+, pnpm 9+, and FFmpeg.

```bash
git clone https://github.com/RobinEdquist/bookmark.git
cd bookmark

# Pre-built image, exposes port 3001
docker compose -f docker-compose.prod.yml up -d

# Or build from source
docker compose up -d
```

That's it for a local try-out — an auth secret is generated on first start, and everything defaults to `http://localhost:3001`. For a real deployment (your own domain, media folders), copy the config template and fill in the essentials:

```bash
cp example.env .env
```

```env
PUBLIC_URL=https://bookmark.yourdomain.com
POSTGRES_PASSWORD=pick-something-strong

# Your media (read-only mounts — Bookmark never writes to them)
AUDIOBOOK_LIBRARY_PATH=/path/to/your/audiobooks
EBOOK_LIBRARY_PATH=/path/to/your/ebooks
COMIC_LIBRARY_PATH=/path/to/your/comics
```

Visit `http://localhost:3001` (or your domain). The first account you create becomes the admin. From there, head to **Settings → Libraries**, point Bookmark at your folders, hit **Scan**, and you're set.

### Configuration

Everything is set through environment variables in your `.env` file. With Docker, a few internal values (the database URL, the internal service URLs) are derived for you, so the lists below are the variables you actually touch.

**Core**

| Variable             | Required | Default    | Description                                                   |
| -------------------- | -------- | ---------- | ------------------------------------------------------------- |
| `PUBLIC_URL`         | For remote access | `http://localhost:3001` | Full URL where Bookmark is reachable; used for auth and CORS |
| `BETTER_AUTH_SECRET` | No       | auto-generated | Secret for signing sessions; generated and persisted in the data volume on first start if unset |
| `POSTGRES_PASSWORD`  | No       | `postgres` | Database password — change it before exposing anything        |
| `POSTGRES_USER`      | No       | `postgres` | Database user                                                 |
| `POSTGRES_DB`        | No       | `bookmark` | Database name                                                 |
| `PORT`               | No       | `3001`     | Host port the web app is published on                         |
| `LOG_LEVEL`          | No       | `info`     | Backend log verbosity (`debug`, `info`, `warn`, `error`)      |

**Media and storage**

| Variable                 | Required | Default              | Description                                |
| ------------------------ | -------- | -------------------- | ------------------------------------------ |
| `DATA_PATH`              | No       | `./data`             | Host path for app data (database, covers)  |
| `AUDIOBOOK_LIBRARY_PATH` | No       | `./media/audiobooks` | Your audiobook folder (mounted read-only)  |
| `EBOOK_LIBRARY_PATH`     | No       | `./media/ebooks`     | Your ebook folder (mounted read-only)      |
| `COMIC_LIBRARY_PATH`     | No       | `./media/comics`     | Your comic folder (mounted read-only)      |

**Single sign-on (optional)** — leave `OIDC_ENABLED=false` to use the built-in email/password login.

| Variable             | Required        | Default | Description                            |
| -------------------- | --------------- | ------- | -------------------------------------- |
| `OIDC_ENABLED`       | No              | `false` | Turn OpenID Connect SSO on or off      |
| `OIDC_ISSUER_URL`    | If SSO enabled  | —       | Issuer URL from your identity provider |
| `OIDC_CLIENT_ID`     | If SSO enabled  | —       | Client ID                              |
| `OIDC_CLIENT_SECRET` | If SSO enabled  | —       | Client secret                          |

**Integrations (optional)**

| Variable        | Required | Default | Description                                                                    |
| --------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `GR_FINDER_URL` | No       | —       | URL of a Goodreads finder service; enables Goodreads metadata lookups when set |

**Pre-built image** — only used when you run `docker-compose.prod.yml` instead of building from source.

| Variable     | Required | Default             | Description                           |
| ------------ | -------- | ------------------- | ------------------------------------- |
| `REGISTRY`   | No       | `ghcr.io`           | Container registry to pull image from |
| `IMAGE_NAME` | No       | `your-org/bookmark` | Image name                            |
| `IMAGE_TAG`  | No       | `latest`            | Image tag to deploy                   |

#### Running without Docker

If you start the apps directly (see [Development](#development)), the Docker-derived values aren't set for you — point the services at each other with these:

| Variable              | Service | Description                                                       |
| --------------------- | ------- | ----------------------------------------------------------------- |
| `DATABASE_URL`        | API     | Postgres connection string                                        |
| `BETTER_AUTH_URL`     | API     | The API's own base URL (e.g. `http://localhost:3000`)             |
| `UI_URL`              | API     | Frontend origin, for CORS (e.g. `http://localhost:3001`)          |
| `APP_DATA_PATH`       | API     | Where covers and cache are written (required in production)       |
| `API_URL`             | Web     | Backend URL the web app proxies to (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Web     | Backend URL exposed to the browser                                |

`NODE_ENV` follows the usual Node convention and is set for you in Docker; `DEBUG` only adds verbose output to the end-to-end tests.

### Supported formats

- **Audiobooks** — M4B (with chapters), MP3, M4A/AAC, OGG/Opus
- **Ebooks** — EPUB
- **Comics** — CBZ, CBR, PDF

## Development

```bash
pnpm install
cp example.env .env          # point it at a local Postgres

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

API docs (Swagger) live at `http://localhost:3000/api/docs` once the backend is up. The repo is laid out as `apps/web` (Next.js) and `apps/backend` (NestJS), with shared code under `packages/`.

## Roadmap

- [x] Comics — browse, organize, and download (CBZ/CBR/PDF) with Comic Vine metadata
- [ ] In-browser reader for ebooks and comics
- [ ] Hardcover reading-progress sync
- [ ] User statistics and listening insights

## Thanks to

- [Hardcover](https://hardcover.app) for book metadata and ratings
- [Comic Vine](https://comicvine.gamespot.com) for comic series and issue metadata (used under its non-commercial terms)
- [Audnexus](https://github.com/laxamentumtech/audnexus) for extra audiobook metadata
- [FFmpeg](https://www.ffmpeg.org/) for the heavy lifting on media

## License

[MIT](LICENSE) © Robin Edquist
