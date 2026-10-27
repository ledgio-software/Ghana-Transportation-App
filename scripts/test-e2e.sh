#!/usr/bin/env bash
# Browser tests against a real database and API: builds the passenger web app and the admin
# for a local API, fetches PostgREST if needed, then runs e2e/run.js.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/test-e2e.sh
# Needs: Postgres 15+ with PostGIS, psql, Node 22, Playwright's Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?set DATABASE_URL to a Postgres superuser connection (the e2e database is created and dropped)}"
POSTGREST_VERSION=12.2.3
BIN_DIR="e2e/.bin"
export POSTGREST_BIN="${POSTGREST_BIN:-$BIN_DIR/postgrest}"
if [ ! -x "$POSTGREST_BIN" ]; then
  mkdir -p "$BIN_DIR"
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x64.tar.xz" \
    | tar -xJ -C "$BIN_DIR"
fi

ANON_KEY=$(node -e "console.log(require('./e2e/lib').sign({ role: 'anon' }))")
API_URL="http://localhost:$(node -e "console.log(require('./e2e/lib').API_PORT)")"
BUILD_DIR=$(mktemp -d)

if [ -z "${SKIP_BUILD:-}" ]; then
  (cd apps/passenger && EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY=e2e-maps-key EXPO_OFFLINE=1 CI=1 \
    npx expo export --platform web --output-dir "$BUILD_DIR/passenger" >/dev/null)
  (cd apps/admin && NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" NEXT_TELEMETRY_DISABLED=1 \
    npx next build >/dev/null && cp -r out "$BUILD_DIR/admin" && rm -rf out)
fi

ADMIN_DIST="${ADMIN_DIST:-$BUILD_DIR/admin}" PASSENGER_DIST="${PASSENGER_DIST:-$BUILD_DIR/passenger}" node e2e/run.js
