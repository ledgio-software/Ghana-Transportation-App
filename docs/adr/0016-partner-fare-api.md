# 0016. Fare API for unions and operators

Status: Accepted

## Context

Fares change, and GPRTU sets many of them. Waiting for staff to retype or upload each change leaves passengers with old prices. GPRTU has no API of its own that we can read from, so we give them one to send changes to.

## Decision

- Partners (GPRTU, other unions, bus companies) call the database function `partner_update_fares(p_key, p_fares)` through Supabase's public REST address, with the app's public key and their own **partner key** (`docs/partner-fare-api.md`).
- Admins make partner keys on the admin's Partners page. A key is shown once, stored only as a SHA-256 hash, tied to one operator, and can be stopped at any time.
- Partner fares go through the same fare logic as the spreadsheet import (`apply_fare_rows`): create, confirm, change with history and alerts to people who saved the route, or skip when a newer price exists. Every fare counts as official for the partner's operator. Station codes are the stations' slugs.
- Each call is logged (`partner_fare_updates`, kept 12 months) and shown to admins with any problems.

## Options considered

- Pulling from a GPRTU API: none exists; we can add a reader if one appears.
- A Vercel Function with the service key in front of the database: one more secret and moving part, with the same result.
- Letting partners sign in to the admin: needs accounts and two-factor for every partner system.

## Consequences

Anyone with a partner key can change that partner's fares, so keys are handed over privately and stopped when leaked. Up to 500 fares per call. The function refuses unknown stations and prices of 0 or less, but a wrong but plausible price goes live; staff can see and correct it from the Partners page and the fare history.
