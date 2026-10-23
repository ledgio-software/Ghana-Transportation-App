# 0012. Data retention periods

Status: Proposed (needs lawyer)

## Context

Act 843: keep personal data no longer than necessary.

## Decision

Defaults from Phase 0 doc 2.1, enforced nightly by `purge_expired_data()` (pg_cron): reports anonymised after 90 days, trip summaries deleted after 12 months, weather cache after 7 days. Deleting an account removes the auth user and cascades to personal tables immediately. Phase 2 adds raw GPS points (30 days).

## Consequences

Change the windows in one SQL function once the lawyer confirms them.
