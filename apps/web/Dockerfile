# syntax=docker/dockerfile:1
# ---- base: workspace install ----
# glibc (not Alpine/musl) — QEMU-emulated arm64 builds of this image hang
# indefinitely inside `pnpm install` on musl (CI runs amd64; arm64 is
# cross-built). Matches apps/worker's base for the same class of reason.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @readmepls/web... build
# pnpm 11 deploy needs --legacy to bundle workspace packages (@readmepls/*) into /out
RUN pnpm --filter @readmepls/web deploy --prod --legacy /out

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app
COPY --from=build --chown=app:app /out ./
USER app
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok||r.status===404?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
