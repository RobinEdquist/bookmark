# Backend Dockerfile - NestJS API
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Base image with pnpm
# =============================================================================
FROM node:22-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install system dependencies required for native modules and media processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =============================================================================
# Stage 2: Install dependencies
# =============================================================================
FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all package.json files for workspace resolution
COPY apps/backend/package.json ./apps/backend/
COPY packages/typescript-config/package.json ./packages/typescript-config/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build the application
# =============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules

# Copy source code
COPY apps/backend ./apps/backend
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Build the backend
WORKDIR /app/apps/backend
RUN pnpm build
WORKDIR /app

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:22-slim AS runner

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application and package files
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./
COPY --from=builder /app/apps/backend/drizzle ./drizzle

# Install production dependencies only
RUN pnpm install --prod

# Create data directory
RUN mkdir -p /data && chown -R nestjs:nodejs /data

# Switch to non-root user
USER nestjs

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_DATA_PATH=/data

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/src/main"]
