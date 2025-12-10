# Backend Dockerfile - NestJS API
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Base image with pnpm
# =============================================================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install system dependencies required for native modules and media processing
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    vips-dev

WORKDIR /app

# =============================================================================
# Stage 2: Install dependencies
# =============================================================================
FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all package.json files for workspace resolution
COPY apps/backend/package.json ./apps/backend/
COPY packages/ui/package.json ./packages/ui/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

# Install node-gyp globally for native module compilation
RUN npm install -g node-gyp

# Install all dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build the application
# =============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY apps/backend ./apps/backend
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Build the backend
RUN pnpm --filter backend build

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:20-alpine AS runner

# Install runtime dependencies only
RUN apk add --no-cache ffmpeg vips

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./
COPY --from=builder /app/apps/backend/drizzle ./drizzle
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps_node_modules

# Merge node_modules (backend-specific deps override workspace deps)
RUN cp -r ./apps_node_modules/* ./node_modules/ 2>/dev/null || true && \
    rm -rf ./apps_node_modules

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
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]
