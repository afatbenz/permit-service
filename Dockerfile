# ─── permit-service backend Dockerfile ──────────────────────────────────
# Multi-stage: install deps → build → prune to devDeps → runtime.
# Migrations run automatically on boot via AUTO_MIGRATE_ON_BOOT=true.
# ─────────────────────────────────────────────────────────────────────────

# ---- Stage 1: install all deps (incl. dev) + build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: production image ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built dist + compiled migrations assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]