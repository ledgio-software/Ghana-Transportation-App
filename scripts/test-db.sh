#!/usr/bin/env bash
# Applies every migration and the seed to a fresh database, then runs the access-rule checks.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?set DATABASE_URL to an empty Postgres 15+ database with PostGIS available}"
DB_NAME="gta_test_$$"
ADMIN_URL="$DATABASE_URL"
TEST_URL="${DATABASE_URL%/*}/${DB_NAME}"

psql "$ADMIN_URL" -qc "create database ${DB_NAME}"
trap 'psql "$ADMIN_URL" -qc "drop database if exists ${DB_NAME} with (force)"' EXIT

run() { psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$1"; }
run supabase/tests/bootstrap_plain_postgres.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; run "$f"; done
run supabase/seed.sql
run supabase/tests/rls_test.sql
