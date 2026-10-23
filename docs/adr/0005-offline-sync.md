# 0005. Offline sync and conflicts

Status: Accepted

## Context

Data and signal drop on highways and in rural areas.

## Decision

Reads: online first, falling back to the last saved copy on the phone (SQLite-backed storage on Android, browser storage on web), with an 'Offline, saved on' notice. Fares: the server always wins. Reports: written to a local outbox with a `client_id`; the server rejects duplicates via a unique constraint.

## Options considered

Full two-way sync engine (WatermelonDB, PowerSync): more than Phase 1 needs. Revisit if offline editing grows.

## Consequences

The outbox for reports is built with the P1-REPORT feature.
