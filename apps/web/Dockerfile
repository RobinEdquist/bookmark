# Frontend Dockerfile - Next.js Web App
# Multi-stage build using turbo prune for optimized monorepo builds

# =============================================================================
# Stage 1: Base image with pnpm and turbo
# =============================================================================
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && \
    pnpm install turbo --global

WORKDIR /app

# =============================================================================
# Stage 2: Prune the monorepo for web only
# =============================================================================
FROM base AS builder

COPY . .
RUN turbo prune web --docker

# =============================================================================
# Stage 3: Install dependencies and build
# =============================================================================
FROM base AS installer

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

# Set build-time environment variable for SSR API calls
# Note: API_URL is used by next.config.js rewrites for server-side requests
# No NEXT_PUBLIC_* vars needed - WebSocket uses same-origin connection
ARG API_URL=http://backend:3000
ENV API_URL=${API_URL}

# Build the frontend
RUN turbo run build --filter=web

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:22-slim AS runner

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy Next.js standalone output
COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001 || exit 1

CMD ["node", "apps/web/server.js"]
