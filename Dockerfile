# Bookmark - Combined Dockerfile (backend + web in a single image)
# Multi-stage build using turbo prune for optimized monorepo builds
#
# The image runs both apps: the NestJS API on an internal port (3000) and the
# Next.js web app on the published port (3001). The web app proxies all /api
# traffic to the backend, so only port 3001 needs to be exposed.

# =============================================================================
# Stage 1: Base image with pnpm and turbo
# =============================================================================
FROM node:26-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"

# python3/make/g++: fallback toolchain for native deps without a prebuilt
# binary for Node 26's ABI, so pnpm install can compile them via node-gyp
# instead of failing outright (e.g. ssh2's optional cpu-features binding).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Node 25+ no longer bundles corepack, so install it explicitly via npm first.
RUN npm install --global corepack@latest && \
    corepack enable && \
    corepack prepare pnpm@9.0.0 --activate && \
    pnpm install turbo --global

WORKDIR /app

# =============================================================================
# Backend: prune, install, and build
# =============================================================================
FROM base AS backend-pruner

COPY . .
RUN turbo prune backend --docker

FROM base AS backend-installer

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pruned lockfile and workspace config
COPY --from=backend-pruner /app/out/json/ .
COPY --from=backend-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=backend-pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies (using cache mount for faster rebuilds)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy pruned source code
COPY --from=backend-pruner /app/out/full/ .
COPY turbo.json turbo.json

# Build the backend
RUN turbo run build --filter=backend

# =============================================================================
# Backend: production-only dependencies
# =============================================================================
FROM base AS backend-proddeps

WORKDIR /app

COPY --from=backend-pruner /app/out/json/ .
COPY --from=backend-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=backend-pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Strip packages that can never be loaded at runtime:
# - next + @next/swc (~400MB): pulled in only as better-auth's optional peer
#   dependency; the NestJS backend never imports better-auth's Next.js adapter
# - *musl* native variants: the runtime image is Debian (glibc), so the musl
#   builds of sharp/canvas/etc. are dead weight (their loaders fall back safely)
RUN rm -rf /app/node_modules/.pnpm/next@* \
    /app/node_modules/.pnpm/@next+swc* \
    /app/node_modules/.pnpm/*musl*

# =============================================================================
# Web: prune, install, and build
# =============================================================================
FROM base AS web-pruner

COPY . .
RUN turbo prune web --docker

FROM base AS web-installer

WORKDIR /app

# Copy pruned lockfile and workspace config
COPY --from=web-pruner /app/out/json/ .
COPY --from=web-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=web-pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies (using cache mount for faster rebuilds)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy pruned source code
COPY --from=web-pruner /app/out/full/ .
COPY turbo.json turbo.json

# Build-time environment variable for SSR API calls (next.config.js rewrites).
# In the combined image the backend always runs in the same container.
ARG API_URL=http://127.0.0.1:3000
ENV API_URL=${API_URL}

# Force same-origin WebSocket/socket.io connections in the published image.
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so a stray
# apps/web/.env (localhost dev value) must never leak in — empty = same origin,
# which makes the image work on any domain behind a reverse proxy.
ENV NEXT_PUBLIC_API_URL=""

# Build the frontend
RUN turbo run build --filter=web

# =============================================================================
# Production image: backend + web standalone
# =============================================================================
FROM node:26-slim AS runner

# Install runtime dependencies (curl for health checks, openssl for secret
# generation, ca-certificates so curl can fetch over HTTPS — the base image
# ships no CA bundle, and Node uses its own). ffmpeg comes as static binaries
# below — Debian's ffmpeg package drags in ~400MB of X11/Mesa/LLVM libraries
# the backend never uses.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mwader/static-ffmpeg:7.1.1 /ffmpeg /usr/local/bin/ffmpeg
COPY --from=mwader/static-ffmpeg:7.1.1 /ffprobe /usr/local/bin/ffprobe

# =============================================================================
# Bundled PostgreSQL
#
# Bookmark runs its own Postgres when DATABASE_URL is unset, so a hoster needs
# one container instead of two (see docker-entrypoint.sh). Pointing
# DATABASE_URL at an external server skips all of this and none of it is used.
#
# Same engine either way — one SQL dialect, one set of migrations. That is the
# whole reason for bundling a real server rather than embedding a second engine
# like SQLite, which would mean maintaining every migration and raw query twice.
# =============================================================================
ENV PG_MAJOR=18
ENV PATH="$PATH:/usr/lib/postgresql/18/bin"
ENV LANG=en_US.utf8

# Fixed uid/gid matching the official postgres image, so a data directory stays
# readable if it is ever moved between the two.
RUN set -eux; \
    groupadd -r postgres --gid=999; \
    useradd -r -g postgres --uid=999 --home-dir=/var/lib/postgresql --shell=/bin/bash postgres

# Generate en_US.UTF-8 and initdb against it (see the LANG default below).
# Collation is not cosmetic here: the app leaves every ORDER BY on text columns
# to the database and searches through pg_trgm indexes, and Postgres 18 made
# full-text search and pg_trgm follow the cluster's collation provider instead
# of always using libc. Matching the official image's libc en_US.UTF-8 keeps
# sorting and search identical between bundled and external deployments.
#
# Debian's -slim images exclude /usr/share/locale via dpkg config, so that
# exclusion has to go before the locale can be built.
RUN set -eux; \
    if [ -f /etc/dpkg/dpkg.cfg.d/docker ]; then \
        sed -ri '/\/usr\/share\/locale/d' /etc/dpkg/dpkg.cfg.d/docker; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends locales; \
    rm -rf /var/lib/apt/lists/*; \
    echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen; \
    locale-gen; \
    locale -a | grep -q 'en_US.utf8'

# PGDG rather than Debian's own postgresql package: it pins the major version
# independently of the base image, so a future node:NN bump to a new Debian
# release cannot silently change the major version sitting under someone's
# existing data directory.
#
# postgresql-common is installed first so the auto-created "main" cluster can be
# switched off — the entrypoint runs initdb/postgres directly against its own
# PGDATA under /data and never uses pg_ctlcluster.
#
# postgresql-$PG_MAJOR-jit is deliberately not installed. JIT is a separate
# package from 18 onwards, and skipping it drops the ~130MB libllvm dependency
# that this workload would never exercise (jit is also turned off explicitly at
# initdb time to keep it out of the logs). pg_trgm needs no extra package.
# The repository key is fetched as an ASCII-armored file over HTTPS and used
# directly via signed-by, which apt verifies with gpgv — no keyserver round-trip
# and no need for the full gnupg suite in the image.
RUN set -eux; \
    mkdir -p /usr/local/share/keyrings; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/local/share/keyrings/postgres.gpg.asc; \
    . /etc/os-release; \
    echo "deb [signed-by=/usr/local/share/keyrings/postgres.gpg.asc] http://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main $PG_MAJOR" \
        > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-common; \
    sed -ri 's/#(create_main_cluster) .*$/\1 = false/' /etc/postgresql-common/createcluster.conf; \
    apt-get install -y --no-install-recommends "postgresql-$PG_MAJOR"; \
    rm -rf /var/lib/apt/lists/*; \
    postgres --version

# Backend: production node_modules (preserves pnpm symlinks) + built output.
# drizzle.config.ts and the migrations folder are needed at startup for
# `drizzle-kit migrate`; everything else the app loads lives in dist/.
COPY --from=backend-proddeps /app /app

# Headless Chromium for the built-in Goodreads scraper — book pages sit behind
# an AWS WAF JS challenge that only a real browser solves. Installing through
# the playwright CLI in node_modules keeps the browser build in lockstep with
# the playwright library version; --with-deps pulls in the required system
# libraries. Placed before the dist/ copies so source-only rebuilds reuse this
# (large) layer.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN cd /app/apps/backend && npx playwright install --with-deps chromium

COPY --from=backend-installer /app/apps/backend/dist /app/apps/backend/dist
COPY --from=backend-installer /app/apps/backend/drizzle /app/apps/backend/drizzle
COPY --from=backend-installer /app/apps/backend/drizzle.config.ts /app/apps/backend/drizzle.config.ts

# Web: Next.js standalone output is self-contained
COPY --from=web-installer /app/apps/web/.next/standalone /web
COPY --from=web-installer /app/apps/web/.next/static /web/apps/web/.next/static
COPY --from=web-installer /app/apps/web/public /web/apps/web/public

# Create data directory (will be owned by root, but mount will override)
RUN mkdir -p /data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment defaults
ENV NODE_ENV=production
ENV APP_DATA_PATH=/data
# Runtime URL the web app uses for SSR API calls — same container, so localhost
ENV API_URL=http://127.0.0.1:3000

# Build provenance, supplied by CI (see .github/workflows/build.yml). The
# running container has no git checkout and cannot read its own OCI labels, so
# passing these in as build args is the only way /api/version can report what
# the image actually is. Declared this late on purpose: they change on every
# commit, and an earlier ARG would invalidate every layer below it.
ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=""
ENV APP_VERSION=${APP_VERSION}
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}

# 3001: web app (publish this). 3000: backend API (internal, optional to publish)
EXPOSE 3001
EXPOSE 3000

# Health check covers both processes
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health && curl -f http://localhost:3001 || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
