# 0002. Backend: Supabase instead of NestJS

Status: Accepted

## Context

Phase 0 doc 7.1 recommended a NestJS modular monolith on managed Postgres. The founder chose Supabase.

## Decision

Supabase is the whole backend: Postgres + PostGIS, Auth, PostgREST API with row level security, Edge Functions (Deno) for vendor calls, pg_cron for jobs.

## Options considered

NestJS API with Supabase only as the database (more control, more servers to run).

## Consequences

Business rules that must run offline live in `packages/shared`. Server rules live in SQL functions and RLS policies, so tests must exercise the database (`scripts/test-db.sh`). Module boundaries are enforced by table ownership (architecture.md), not by folders.
