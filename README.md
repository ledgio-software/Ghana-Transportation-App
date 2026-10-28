# Ghana-Transportation-App

A Ghana travel app. It tells any traveller what a trip will cost, how to get there and how long it will take, with weather and hazard alerts. See the PRD and the Phase 0 build documentation for the product and the plan. This repository holds the **walking skeleton** (Phase 0 doc 8.8): the full pipeline working end to end before Phase 1 features are built on top.

| Platform | How users get it |
| --- | --- |
| Android | Play Store app built from `apps/passenger` (React Native + Expo) |
| iPhone | Web app (PWA) built from the **same code** and installed from Safari with "Add to Home Screen" |
| Staff | Admin dashboard in `apps/admin` (Next.js) |

The backend is **Supabase**: Postgres + PostGIS, phone-number auth, row level security, Edge Functions and scheduled jobs.

## Repository layout

```
apps/passenger      Android app + iPhone web app (Expo, TypeScript, Expo Router)
apps/admin          Staff dashboard (Next.js static export)
packages/shared     Business rules, types and English/Twi strings used by both apps
supabase/           Database migrations, seed data, edge functions, local config
  migrations/       Additive-only SQL migrations (core, phase 1, retention)
  functions/        send-sms (Hubtel -> Arkesel failover), delete-account
  tests/            Access-rule tests run against plain Postgres in CI
docs/               Architecture notes, decision records (docs/adr), Phase 1 user stories
scripts/test-db.sh  Applies migrations to a fresh database and runs the access-rule tests
```

## What the skeleton already does

**Design:** Ghana colours (green for actions, red for emergencies and warnings, gold for highlights, the flag stripe with the black star as our mark), large text and strong contrast for sunlight. Bottom tabs: Home, My trips, Safety, Settings. Results show the ways to travel as cards to swipe and tap when there is a choice.

- **Fare search (P1-FARE):** pick a start and destination. Each option shows the official fare, what people paid this week, when it was last checked, and the departure pattern. Works without an account.
- **Fair price check (P1-ALERT):** type the fare the mate asks for and see "Above normal fare" if it is more than 10% over.
- **Offline:** stations and fares you have searched are saved on the phone and shown with an "Offline" notice when there is no data.
- **English and Twi**, switchable in Settings. The Twi strings are drafts and need review by a native speaker.
- **Phone login with an SMS code (P1-ACC).** Codes go through Hubtel, with Arkesel as a backup.
- **Minimum version check:** older app versions can be told to update.
- **Report what you paid (P1-REPORT) and one-tap overcharge reports (P1-ALERT):** saved on the phone first, sent when online, never duplicated. Behind the `phase1.fare_reports` feature switch.
- **Saved trips and fare-change alerts (P1-NOTIF):** "Save this trip" on the results screen; saved trips are listed on the home screen with their cheapest fare and whether rain is expected. Signed out, trips are saved on the phone and move to the account at sign-in. When staff or a spreadsheet import change a fare on a saved route, the database creates an alert, shown as "Fare changes on your trips: N new" and on the Fare changes screen. Alerts are in-app for now; phone push notifications need the push vendor (Firebase) set up.
- **Route map and directions (P1-TRIP):** "Show route on map" on the results screen loads a Google map of the trip only when tapped (data use). Links open the trip, and walking directions to the station, in Google Maps. The map inside the app needs a Maps Embed API key (`EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY`). "Start live map" opens a full-screen map with the road route, a moving "you are here" dot and the time and distance left (Maps JavaScript API on the same key; the road route comes from the web app's `/api/route` function with a private `GOOGLE_ROUTES_KEY`). "Traffic home" on the home screen shows where you are and the minutes to get home in today's traffic (and how much longer than usual), on a map with Google's live traffic; home is kept on the phone (`/api/traffic`, Routes API with live traffic).
- **Weather for each trip (P1-WX):** the results screen shows the weather at the start now, half way on long trips and at the destination at arrival time, says "Take an umbrella" when rain is expected, and warns about heavy rain. Stations marked "Floods in heavy rain" in the admin get a flood warning. Forecasts come from MET Norway (free) through the web app's `/api/weather` function (ADR 0013).
- **Safety (P1-SAFE):** an "Emergency" button on the home screen lists police, fire and ambulance numbers (112 first), one tap to call, and works with no signal. Passengers can report a driver (reckless driving, abuse of passengers, overloading and more) with up to 3 photos of the vehicle, and rate the driver from 1 to 5 stars. Staff review reports in the admin's Safety page, forward them to MTTD, NRSA or the operator, see ratings and edit the emergency numbers. "Share my trip" on the live map sends family a link (WhatsApp, SMS or copy) to follow the traveller until they arrive, with no sign-in on either side (ADR 0015).
- **Works offline (P1-OFF):** stations, fares and saved trips are kept on the phone, and after one visit the web app (iPhone home-screen app) opens with no network (`apps/passenger/public/sw.js`).
- **Admin for the field team:** staff sign in with email, password and an authenticator-app code. They can add and edit stations (GPS + GhanaPostGPS), routes, operators, fare sources and fares (changes keep history and are written to the audit log), and accept or reject crowd reports. "Overcharging hotspots" shows the routes with the most overcharge reports in the last 30 days.
- **Spreadsheet import:** the field team's CSV files (Google Sheets, Excel, KoboToolbox) for stations and fares, with downloadable templates, a row-by-row check before saving, and results per spreadsheet line (added, confirmed, price changed, skipped as older, failed).
- **Privacy (P1-LEGAL):** before their first report, users agree to the terms and privacy notice (stored as versioned, timestamped consent records; the database refuses reports without it). Settings → Privacy shows their consents, lets them turn marketing on or off, correct their details, download all their data and delete their account. Row level security on every table and a nightly retention job. The full Terms of Use and Privacy Policy are in the app at `/terms` and `/privacy-policy` (drafts for legal review, in `packages/shared/src/legal-text.ts`; `docs/legal/` has copies for the lawyer, rebuilt with `npx vite-node scripts/build-legal-docs.ts`). Bump `LEGAL_VERSIONS` in `packages/shared/src/legal.ts` when the text changes.

## Run it locally

To connect a hosted Supabase project instead of the local stack, follow `docs/supabase-setup.md`.

Requirements: Node 22, Docker (for the local Supabase stack), and the Expo Go app or an Android emulator.

```bash
npm install

# 1. Backend: starts Postgres, Auth, the API and edge functions on http://127.0.0.1:54321
cp supabase/functions/.env.example supabase/functions/.env
npx supabase start          # prints the local anon key
npx supabase db reset       # applies migrations + seed.sql
npx supabase functions serve --env-file supabase/functions/.env

# 2. Passenger app
cp apps/passenger/.env.example apps/passenger/.env.local   # paste the anon key
npm run passenger           # press "a" for Android, "w" for web

# 3. Admin dashboard
cp apps/admin/.env.example apps/admin/.env.local           # paste the anon key
npm run admin               # http://localhost:3000
```

The local test phone number `024 000 0001` signs in with code `123456` without sending an SMS (see `supabase/config.toml`). To create a staff user, add one in Supabase Studio (http://127.0.0.1:54323) and insert a row into `user_roles`.

## Checks

```bash
npm run typecheck                         # all workspaces
npm test                                  # business rules and translations
DATABASE_URL=postgres://... scripts/test-db.sh   # migrations + access rules on Postgres/PostGIS
cd supabase/functions && deno test --allow-env _shared
DATABASE_URL=postgres://... scripts/test-e2e.sh   # browser tests against a real database + API (see e2e/)
```

The browser tests build the passenger web app and the admin, load the migrations and seed into a fresh database, put PostgREST (the API server Supabase uses) in front of it, and drive the apps in Chromium as a signed-in passenger or a staff member with two-factor. Each step also checks what was saved in the database. `E2E_ONLY=admin` runs one suite; failure screenshots go to `e2e/results/`.

CI (`.github/workflows/ci.yml`) runs all of these plus the Android and web builds on every pull request.

## Releasing

- **Android:** `npx eas-cli@latest build -p android --profile production` from `apps/passenger`, then submit to the Play Store internal track (`eas.json`). This needs a company Expo account and Play Console.
- **iPhone web app:** `npm run export:web -w apps/passenger` produces a static site in `apps/passenger/dist`. Host it on any static host over HTTPS.
- **Database:** `npx supabase link` to the environment's project, then `npx supabase db push`. Functions: `npx supabase functions deploy`. Secrets: `npx supabase secrets set --env-file ...`.

## Still needed outside the code (Phase 0 exit checklist)

The domain ghanatransport.com.gh (the app ID `gh.com.ghanatransport.app` is based on it and cannot change after the first Play Store upload), Supabase projects per environment, Hubtel/Arkesel accounts and sender ID, Play Console and Expo accounts, Data Protection Commission registration, lawyer-reviewed terms and privacy notice, the verified seed dataset, and native Twi review. See `docs/architecture.md` for the decisions made so far.
