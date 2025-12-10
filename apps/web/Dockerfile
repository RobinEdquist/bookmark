# Frontend Dockerfile - Next.js Web App
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Base image with pnpm
# =============================================================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install build dependencies for native modules (sharp)
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

# =============================================================================
# Stage 2: Install dependencies
# =============================================================================
FROM base AS deps

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all package.json files for workspace resolution
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

# Install node-gyp globally for native module compilation
RUN pnpm add -g node-gyp

# Install all dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 3: Build the application
# =============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Set build-time environment variables
ARG API_URL=http://backend:3000
ARG NEXT_PUBLIC_API_URL
ENV API_URL=${API_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-$API_URL}

# Build the frontend
RUN pnpm --filter web build

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001 || exit 1

CMD ["node", "apps/web/server.js"]
