#!/bin/sh
set -e

# Idempotent superuser provisioning. `upsert` creates or updates, so re-runs are
# safe. Both are PocketBase superusers (jobs/content rules are superuser-only);
# the worker uses a separate credential from the human admin.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  ./pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD"
fi
if [ -n "$PB_WORKER_EMAIL" ] && [ -n "$PB_WORKER_PASSWORD" ]; then
  ./pocketbase superuser upsert "$PB_WORKER_EMAIL" "$PB_WORKER_PASSWORD"
fi

exec ./pocketbase serve \
  --http 0.0.0.0:8090 \
  --dir /pb_data \
  --migrationsDir /pb_migrations
