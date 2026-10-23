# 0008. API style and versioning

Status: Accepted

## Context

Old app versions stay in use for a long time in Ghana.

## Decision

Use the Supabase REST API (PostgREST) for tables, and SQL RPCs for anything with logic (`search_fares`, `change_fare`, `export_my_data`). Existing columns and RPC signatures are never removed or changed in meaning. A breaking change gets a new RPC name (`search_fares_v2`), and the old one stays until 95% of active users have updated. The minimum version check (`app_versions`) is the last resort.

## Options considered

A separate REST server with OpenAPI.

## Consequences

Generate TypeScript types with `supabase gen types` once projects exist; `packages/shared/src/database.ts` is the hand-written stand-in.
