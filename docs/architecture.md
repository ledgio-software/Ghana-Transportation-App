# Architecture

This follows Phase 0 doc section 7 ("every phase plugs into the same core"), with one change agreed with the founder: **Supabase is the whole backend** instead of a NestJS service on a separately managed Postgres (ADR 0002).

## How the Phase 0 diagram maps to Supabase

| Phase 0 box | Here |
| --- | --- |
| Passenger app | `apps/passenger`: Android build + iPhone web app (PWA) from one Expo codebase |
| Admin web | `apps/admin`: Next.js static site |
| API gateway, versioned `/v1`, login, rate limits | Supabase API (PostgREST + Auth) with row level security. New behaviour goes in new RPCs; existing RPC signatures are never changed (ADR 0008) |
| Backend modules | Postgres tables and functions owned per module (below), plus Edge Functions for anything that calls a vendor |
| Postgres, PostGIS | Supabase Postgres with PostGIS |
| Redis cache | Not needed at launch: offline cache on the phone, CDN for the web app, Postgres indexes. Add Upstash Redis behind an Edge Function if read load requires it |
| Event outbox | Postgres triggers + `pg_cron` jobs; Supabase Queues (pgmq) when Phase 2 needs fan-out |
| Vendor adapters | `supabase/functions/_shared/<service>/` with an interface, a primary and a backup (SMS done; maps, weather and push follow the same pattern) |

## Module ownership

Every table has one owning module. Other modules read through RPCs or views, not by writing to another module's tables.

| Module | Tables | Phase |
| --- | --- | --- |
| Core: accounts, consent | profiles, user_roles, devices, consents | 0/1 |
| Core: places, stations | places, stations, operators, vehicle_types, routes, route_stops, translations | 0/1 |
| Core: notifications | notifications | 0/1 |
| Core: admin, audit | audit_log, feature_flags, app_versions | 0/1 |
| Fares | fare_sources, fares, fare_reports, overcharge_reports | 1 |
| Trips and weather | trips_planned, saved_routes, weather_snapshots | 1 |
| Hazard radar | hazard_zones, hazard_reports, diversions | 1 |

**Reserved names (do not use for anything else):**
- Phase 2: safety_circles, circle_members, live_trips, location_pings, sos_events, check_ins, alert_feeds
- Phase 3: bookings, seats, payments, payouts, parcels, waybills, parcel_events, terminal_maps, driver_ledgers, ledger_entries
- Phase 4: station_queues, queue_entries, manifests, manifest_passengers, ussd_sessions, revenue_shares

## Rules the code already follows

1. **Additive migrations only.** New tables and nullable columns. No renames or drops in the same release.
2. **UUIDs everywhere; money in integer pesewas with a currency code; timestamps in UTC**, shown in Africa/Accra time.
3. **Offline-first reads.** The app shows saved data when the network fails. Reports carry a `client_id` so retries from the phone's outbox never create duplicates.
4. **Feature switches.** `feature_flags` rows, off by default for Phase 2 to 4.
5. **Minimum app version.** `app_versions` is checked on start.
6. **Staff powers need two-factor.** Staff permissions apply only when the session is at `aal2` (password + authenticator code). This is enforced in the database, not just in the dashboard.
7. **No personal data in logs.** Phone numbers are masked.

## Scale

The founder's stated goal is 500 million users. Ghana has about 35 million people and the PRD scope is Ghana only, so the realistic ceiling for this product is in the low tens of millions of installs, with a fraction active each day. The design scales out like this:

- **Reads dominate.** Fare search is a read of slowly-changing data. It is cached on the phone, can be served through a CDN, and runs on indexed queries. Supabase read replicas take further read load.
- **Writes are small and rate-limited.** Crowd reports are limited to 20 per user per hour in the database.
- **The heavy table comes later.** Phase 2 `location_pings` should be partitioned by day and expired after 30 days.
- **Cost scales with use.** The biggest cost is Google Maps API calls, which are cached and capped (vendor rule: budget alarms at 50/80/100%).

Before Phase 2, run a load test at 10× the expected peak against a staging project and pick the Supabase compute size from the results.

## iPhone web app limits

The iPhone version is a web app, which iOS limits:

- **No background location.** Phase 2 live trip sharing and the Phase 1 hazard radar audio alerts only work while the web app is open and on screen. Android has no such limit.
- **Push only after install.** Push notifications only work after the user adds the app to the Home Screen (iOS 16.4+).
- **Storage can be cleared.** iOS may clear site storage after weeks without use, so the offline cache is best-effort.

If safety features become core for iPhone users, ship the same Expo code as a native iOS app (Apple Developer account, US$99/year). No rewrite is needed.
