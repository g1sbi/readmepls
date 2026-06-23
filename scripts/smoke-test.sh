#!/usr/bin/env bash
# End-to-end self-host smoke test: boots the full stack with `docker compose`,
# verifies all three services come up, then drives one job through the worker
# and asserts it reaches `done`.
#
# Determinism: the worker runs with AI_PROVIDER=mock (no Anthropic key/cost). The
# web app on this branch has no auth yet, so the job is seeded directly via the
# PocketBase superuser REST API rather than POSTed to /api/capture. The worker
# still performs a real HTTP fetch of the seeded URL (example.com — RFC-2606
# reserved and stable), so a network connection is required.
set -euo pipefail

cd "$(dirname "$0")/.."

PB_PORT="${PB_PORT:-8090}"
WEB_PORT="${WEB_PORT:-3000}"
SEED_URL="https://example.com"

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f .env ] || cp .env.example .env
# Admin creds for the REST calls below.
set -a; . ./.env; set +a

echo "==> building + starting stack (worker in mock-AI mode)"
AI_PROVIDER=mock docker compose up -d --build

wait_for() { # <name> <url>
  for i in $(seq 1 30); do
    if curl -fsS "$2" >/dev/null 2>&1; then echo "$1 up"; return 0; fi
    sleep 2
  done
  echo "$1 never came up: $2"; docker compose logs "$1"; exit 1
}

echo "==> waiting for pocketbase health"
wait_for pocketbase "http://localhost:${PB_PORT}/api/health"

echo "==> waiting for web"
# adapter-node returns 404 on / before routes exist; treat any HTTP reply as up.
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}/" || true)
  if [ "$code" != "000" ] && [ -n "$code" ]; then echo "web responding ($code)"; break; fi
  [ "$i" = "30" ] && { echo "web never responded"; docker compose logs web; exit 1; }
  sleep 2
done

echo "==> authenticating as PocketBase superuser"
TOKEN=$(curl -fsS -X POST \
  "http://localhost:${PB_PORT}/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "superuser auth failed"; exit 1; }

echo "==> seeding a queued job for ${SEED_URL}"
curl -fsS -X POST "http://localhost:${PB_PORT}/api/collections/jobs/records" \
  -H "Authorization: ${TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"user\":\"smoke\",\"canonical_url\":\"${SEED_URL}\",\"type\":\"extract\",\"status\":\"queued\",\"attempts\":0}" \
  >/dev/null

echo "==> waiting for the worker to mark the job done"
for i in $(seq 1 30); do
  STATUS=$(curl -fsS -H "Authorization: ${TOKEN}" \
    "http://localhost:${PB_PORT}/api/collections/jobs/records?filter=$(printf 'canonical_url="%s"' "$SEED_URL")" \
    | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' | head -n1)
  echo "   job status: ${STATUS:-<none>}"
  [ "$STATUS" = "done" ] && { echo "==> SMOKE PASS"; exit 0; }
  [ "$STATUS" = "failed" ] && { echo "worker marked job failed"; docker compose logs worker; exit 1; }
  sleep 2
done

echo "worker did not finish the job in time"; docker compose logs worker; exit 1
