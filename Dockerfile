# Bookmark - Combined Dockerfile (backend + web in a single image)
# Multi-stage build using turbo prune for optimized monorepo builds
#
# The image runs both apps: the NestJS API on an internal port (3000) and the
# Next.js web app on the published port (3001). The web app proxies all /api
# traffic to the backend, so only port 3001 needs to be exposed.

# =============================================================================
# Stage 1: Base image with pnpm and turbo
# =============================================================================
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"

RUN corepack enable && \
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
FROM node:22-slim AS runner

# Install runtime dependencies (curl for health checks, openssl for secret
# generation). ffmpeg comes as static binaries below — Debian's ffmpeg package
# drags in ~400MB of X11/Mesa/LLVM libraries the backend never uses.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mwader/static-ffmpeg:7.1.1 /ffmpeg /usr/local/bin/ffmpeg
COPY --from=mwader/static-ffmpeg:7.1.1 /ffprobe /usr/local/bin/ffprobe

# Backend: production node_modules (preserves pnpm symlinks) + built output.
# drizzle.config.ts and the migrations folder are needed at startup for
# `drizzle-kit migrate`; everything else the app loads lives in dist/.
COPY --from=backend-proddeps /app /app
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

# 3001: web app (publish this). 3000: backend API (internal, optional to publish)
EXPOSE 3001
EXPOSE 3000

# Health check covers both processes
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health && curl -f http://localhost:3001 || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
