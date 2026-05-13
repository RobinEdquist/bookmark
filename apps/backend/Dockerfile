# Backend Dockerfile - NestJS API
# Multi-stage build using turbo prune for optimized monorepo builds
# Based on: https://www.bstefanski.com/blog/turborepo-nestjs-prisma-dockerfile

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
# Stage 2: Prune the monorepo for backend only
# =============================================================================
FROM base AS builder

COPY . .
RUN turbo prune backend --docker

# =============================================================================
# Stage 3: Install dependencies and build
# =============================================================================
FROM base AS installer

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pruned lockfile and workspace config
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies (using cache mount for faster rebuilds)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy pruned source code
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Build the backend
RUN turbo run build --filter=backend

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:22-slim AS runner

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire pruned app with node_modules intact (preserves pnpm symlinks)
COPY --from=installer /app ./

# Create data directory (will be owned by root, but mount will override)
RUN mkdir -p /data

WORKDIR /app/apps/backend

# Copy entrypoint script (from installer stage which has the pruned source)
COPY --from=installer /app/apps/backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_DATA_PATH=/data

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
