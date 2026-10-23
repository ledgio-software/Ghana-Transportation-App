# 0004. Database, PostGIS and migrations

Status: Accepted

## Context

Stations, routes and hazard zones are geographic. Later phases must only add, never reshape.

## Decision

Postgres with PostGIS in the `extensions` schema. Use Supabase CLI migrations in `supabase/migrations`, additive only. UUID keys, integer pesewas, timestamptz. Fares keep history (`effective_to`) instead of being overwritten.

## Options considered

Separate migration tool (Prisma, Flyway).

## Consequences

Every migration is applied to a fresh database in CI with access-rule tests.
