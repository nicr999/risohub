# ============================================================
# RISO HUB — Dockerfile (backend)
# Multi-stage build: build TypeScript, run compiled JS
# Target: Render or Railway (Node.js service)
# ============================================================

# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Stage 2: Production image ──────────────────────────────────
FROM node:20-alpine AS production

# Security: don't run as root
RUN addgroup -S risohub && adduser -S risohub -G risohub

WORKDIR /app

# Copy compiled output and production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Health check — Render uses this
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

# Switch to non-root user
USER risohub

EXPOSE 3001

# Run migrations then start server
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/server.js"]
