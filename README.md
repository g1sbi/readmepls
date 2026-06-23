![readmepls](assets/banner.png)
# readmepls

Introducing: `readmepls`, your one-stop app to store, read, highlight, annotate and categorize your favorite articles.

Paste any link to extract the readable content into your library and auto-tag it. Read directly in app, or export and keep in sync to your Notion/Obsidian (coming later).

Start using it immediately at [https://readmepls.com](https://readmepls.com), or self-host it!

## Roadmap

- **Phase 1 — Core capture loop:** paste → canonicalize → cache dedupe → article
  extraction → AI tagging → stored. *(in progress)*
- **Phase 2 — Reader:** reader view, typography + theme controls.
- **Phase 3 — Library:** highlights + notes, full-text search, tags & collections.
- **Phase 4 — More sources:** X/Twitter threads, YouTube transcripts, etc.
- **Phase 5 — Connectors:** plugin seam + working Markdown export, Notion / Obsidian.

## Self-hosting

`readmepls` runs as three containers (PocketBase, web, worker) via Docker Compose.

**Requirements:** Docker with the Compose plugin.

1. Clone the repo and copy the env template:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env`: set `ANTHROPIC_API_KEY`, and change the `PB_ADMIN_*` /
   `PB_WORKER_*` passwords. For a public host, set `PUBLIC_PB_URL` and `ORIGIN`
   to the URLs users will actually hit.
3. Start the stack:
   ```bash
   docker compose up -d
   ```
   This pulls published images from `ghcr.io`. Set `IMAGE_OWNER` in `.env` to the
   GitHub org/user that hosts them (lowercase). To build from source instead, run
   `docker compose up -d --build` (no `IMAGE_OWNER` needed).
4. Open `http://localhost:3000` for the app, and `http://localhost:8090/_/` for
   the PocketBase admin (log in with `PB_ADMIN_*`).

**TLS:** the app serves plain HTTP. For a public deployment, put it behind your
own reverse proxy (Caddy, Traefik, or nginx) terminating TLS and forwarding to the
`web` (3000) and `pocketbase` (8090) ports.

**Updating:** `docker compose pull && docker compose up -d`. Data persists in the
`pb_data` volume.

**Smoke test:** `pnpm smoke` boots the full stack, seeds one job, and asserts the
worker processes it end-to-end (uses a mock AI provider, so no API key is needed).

## License

[GNU AGPL-3.0-or-later](LICENSE). You may use, modify, and self-host freely; if you
run a modified version as a network service, you must release your source changes.

Copyright (C) 2026 readmepls authors.
