# syntax=docker/dockerfile:1
# ---- base: workspace install ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY apps/site/package.json apps/site/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: bake the sentinel into the prerendered output ----
FROM base AS build
COPY apps/site ./apps/site
# The docs page inlines these from the repo root via ?raw at build time, so the
# published instructions never drift from the files self-hosters actually copy.
COPY compose.yml .env.example ./
ENV PUBLIC_APP_URL=__APP_URL__
RUN pnpm --filter @readmepls/site build

# ---- runtime: static serve via nginx ----
FROM nginx:alpine AS runtime
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/site/docker-entrypoint.d/40-app-url.sh /docker-entrypoint.d/40-app-url.sh
RUN chmod +x /docker-entrypoint.d/40-app-url.sh
COPY --from=build /repo/apps/site/build /usr/share/nginx/html
ENV APP_URL=https://app.readmepls.com
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  # Probe 127.0.0.1, not localhost: in-container `localhost` resolves to ::1
  # first, but nginx here listens on IPv4 only, so an IPv6 probe is refused.
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
