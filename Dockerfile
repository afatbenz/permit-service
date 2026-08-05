# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies (reproducible via lockfile)
COPY package*.json ./
RUN npm ci

# Compile TypeScript -> dist/
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output + lockfile (npm ci --omit=dev gives runtime deps)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# nest build only compiles TS -> JS; raw SQL migrations are NOT emitted to
# dist. Copy them explicitly so run-migrations.js can apply them at boot.
RUN mkdir -p /app/dist/database/migrations
COPY src/database/migrations/ ./dist/database/migrations/

# Entrypoint runs migrations + role seed, then starts the app.
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
