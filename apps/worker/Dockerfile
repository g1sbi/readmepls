# syntax=docker/dockerfile:1
# ---- base: workspace install ----
# glibc (not Alpine/musl) — sharp and onnxruntime-node resolve/dlopen
# libc-specific native binaries, so install and runtime must share one libc.
FROM node:22-bookworm-slim AS base
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
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app
# Deno: modern yt-dlp needs a JavaScript runtime to solve YouTube's player
# challenge (EJS). Without one, YouTube extraction is deprecated and formats go
# missing. Copy the static binary from Deno's official bin-only image.
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno
# yt-dlp (+ python runtime) for the YouTube transcript extractor. Not an apt
# package on Debian, so install via pip; --break-system-packages is safe here,
# there's no other Python workload in this image to conflict with. The [default]
# extra pulls curl_cffi so yt-dlp can impersonate a browser's TLS fingerprint,
# and bgutil-ytdlp-pot-provider is the yt-dlp plugin that fetches PO tokens from
# the bgutil sidecar — together these get past YouTube's "Sign in to confirm
# you're not a bot" block on datacenter IPs (see YOUTUBE_POT_PROVIDER_URL).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip install --no-cache-dir --break-system-packages \
       "yt-dlp[default,curl-cffi]" bgutil-ytdlp-pot-provider \
    && apt-get purge -y --auto-remove python3-pip \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=app:app /out ./
# Pre-create the TRANSFORMERS_CACHE mount point owned by app: a fresh named
# volume at /data/models inherits ownership from the image path it covers,
# so without this it lands root:root and the embedder's warmup-time mkdir
# (LocalEmbedder) fails with EACCES under the non-root runtime user.
RUN mkdir -p /data/models && chown app:app /data/models
USER app
CMD ["node", "dist/main.js"]
