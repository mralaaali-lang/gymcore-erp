# ====================================================================
# Gimawi SaaS Frontend — Multi-Stage Production Build (Vite + Nginx)
# ====================================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_OPTIONS=--openssl-legacy-provider
ENV npm_config_strict_ssl=false

# Retry loop — Docker Desktop ETXTBSY workaround for esbuild
COPY package.json ./
RUN for i in 1 2 3; do npm install && break; sleep 2; done

COPY tsconfig.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Nginx ----
FROM nginx:alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

RUN chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
