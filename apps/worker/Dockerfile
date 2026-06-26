# syntax=docker/dockerfile:1
# ---- base: workspace install ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
# Manifests first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/types/package.json packages/types/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @readmepls/worker... build
# pnpm 11 deploy needs --legacy to bundle workspace packages (@readmepls/*) into /out
# Produce a self-contained, symlink-free deploy dir.
RUN pnpm --filter @readmepls/worker deploy --prod --legacy /out

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
# yt-dlp (+ python runtime) for the YouTube transcript extractor.
RUN apk add --no-cache python3 yt-dlp
COPY --from=build --chown=app:app /out ./
USER app
CMD ["node", "dist/main.js"]
