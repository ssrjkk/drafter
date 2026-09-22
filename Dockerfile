# ---- build the SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- build Caddy with the rate_limit plugin ----
# The Caddyfile uses the `rate_limit` directive, which is not part of stock
# Caddy, so the binary has to be rebuilt with the module.
FROM caddy:2-builder-alpine AS caddy
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

# ---- runtime ----
FROM caddy:2-alpine
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1
