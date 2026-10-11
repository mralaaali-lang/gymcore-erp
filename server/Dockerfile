# ====================================================================
# Gimawi SaaS Backend — Multi-Stage Production Build
# ====================================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_OPTIONS=--openssl-legacy-provider
ENV npm_config_strict_ssl=false

COPY package.json ./
RUN for i in 1 2 3; do npm install && break; sleep 2; done

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/

RUN mkdir -p /app/logs /app/uploads/members /backups && chown -R appuser:appgroup /app/logs /app/uploads /backups

# Remove dev dependencies to shrink image size
RUN npm prune --omit=dev 2>/dev/null || true

USER appuser

EXPOSE 4000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

CMD ["node", "dist/app.js"]
