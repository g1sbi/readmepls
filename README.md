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

## Running locally

Three processes. Set a shared superuser for the worker + web service client.

```bash
# 1. PocketBase (applies migrations on start)
cd pocketbase && ./pocketbase superuser upsert worker@local password12345
./pocketbase serve --http=127.0.0.1:8090

# 2. Worker (new terminal, from repo root)
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_EMAIL=worker@local PB_ADMIN_PASSWORD=password12345 \
ANTHROPIC_API_KEY=sk-... \
pnpm --filter @readmepls/worker start

# 3. Web (new terminal, from repo root)
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_EMAIL=worker@local PB_ADMIN_PASSWORD=password12345 \
pnpm --filter @readmepls/web dev
```

Open http://localhost:5173, sign up, paste a link, watch it go ready, and read it.
Without `ANTHROPIC_API_KEY` the worker uses a mock tagger (dev only).

## License

[GNU AGPL-3.0-or-later](LICENSE). You may use, modify, and self-host freely; if you
run a modified version as a network service, you must release your source changes.

Copyright (C) 2026 readmepls authors.
