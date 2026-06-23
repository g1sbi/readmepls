#!/bin/sh
set -e

# Superuser provisioning is handled by the PocketBase JS hook at
# pocketbase/pb_hooks/bootstrap_superusers.pb.js, which reads
# PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD and PB_WORKER_EMAIL/PB_WORKER_PASSWORD
# from the process environment. Credentials never appear in argv.

exec ./pocketbase serve \
  --http 0.0.0.0:8090 \
  --dir /pb_data \
  --migrationsDir /pb_migrations \
  --hooksDir /pb_hooks
