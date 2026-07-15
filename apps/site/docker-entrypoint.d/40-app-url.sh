#!/bin/sh
# Rewrite the build-time sentinel __APP_URL__ to the operator's $APP_URL across
# the prerendered static files. nginx:alpine runs /docker-entrypoint.d/*.sh
# before starting nginx, so this fixes the "Open app" link at container start —
# no rebuild needed. SITE_ROOT is overridable so this is testable offline.
set -e
: "${APP_URL:=https://app.readmepls.com}"
root="${SITE_ROOT:-/usr/share/nginx/html}"
find "$root" -type f \( -name '*.html' -o -name '*.js' \) \
  -exec sed -i "s|__APP_URL__|${APP_URL}|g" {} +
