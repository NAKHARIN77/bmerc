#!/bin/sh
# Container start: migrate, set up the database login the API uses, then run the API and/or the site.
#   SERVE=all (default, Render): the site on $PORT and the API on 127.0.0.1:4000 behind it.
#   SERVE=api (Railway, with the site on Vercel): only the API, on $PORT.
# If a process stops, the container exits so the host restarts it.
set -e
cd /app/apps/api
SERVE="${SERVE:-all}"

: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL must be set (the database owner connection)}"
npx prisma migrate deploy

# Prints the URL the API should use (the RLS-bound app role when it can be set up). Logs go to stderr.
DATABASE_URL="${DATABASE_URL:-$(node scripts/prepare-db.mjs)}"
export DATABASE_URL
# Links in emails point at the public site. Render sets RENDER_EXTERNAL_URL; elsewhere set WEB_ORIGIN.
export WEB_ORIGIN="${WEB_ORIGIN:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-3000}}}"

if [ "$SERVE" = "api" ]; then
  # Requests arrive through the site's proxy (Vercel) and the host's router: take the client IP they forward.
  export TRUST_PROXY="${TRUST_PROXY:-true}"
  exec node dist/main.js
fi

PORT=4000 node dist/main.js &
API=$!
cd /app/apps/web
npx next start -H 0.0.0.0 -p "${PORT:-3000}" &
WEB=$!

# Exit as soon as one of them stops.
while kill -0 "$API" 2>/dev/null && kill -0 "$WEB" 2>/dev/null; do sleep 5; done
echo "A process stopped; exiting so the container restarts" >&2
kill "$API" "$WEB" 2>/dev/null || true
exit 1
