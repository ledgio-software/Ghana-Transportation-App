# Phase 1 user stories

Phase 0 doc section 6.2: every Phase 1 feature is written as user stories with an owner, a priority, testable acceptance criteria and a test case before it enters development. This is that list, with the current state of each story.

**Priority:** **Must** = Phase 1 cannot launch without it. **Should** = planned for Phase 1, can slip to a fast follow-up.
**Status:** **Done** = built and every criterion has a passing automated test. **Built** = working, but at least one criterion still needs a device, a vendor account or a person to verify. **Not started**.
**Owner** is the role that answers questions about the story (Phase 0 doc 9.1). The product lead signs off every story.

**Where the tests live:**
- **`e2e/suites/…`**: browser tests against a real database and API (`scripts/test-e2e.sh`), cited as *suite › step*.
- **`supabase/tests/rls_test.sql`**: database and access-rule tests (`scripts/test-db.sh`).
- **`packages/shared/test/…`**: unit tests (`npm test`).
- **`supabase/functions/_shared/sms/failover_test.ts`**: edge-function tests (`deno test`).

## Summary

| Module | Stories | Done | Built | Not started | Blocked by |
| --- | --- | --- | --- | --- | --- |
| P1-ACC Accounts | 4 | 2 | 2 | 0 | Hubtel/Arkesel accounts and sender ID; Twi review |
| P1-FARE Fare directory | 4 | 2 | 0 | 2 | Device lab for speed and data targets |
| P1-ALERT Fair price check | 2 | 1 | 1 | 0 | Device test on a 2 GB phone |
| P1-REPORT Crowd reports | 5 | 4 | 0 | 1 | — |
| P1-TRIP Route and ETA | 3 | 0 | 0 | 3 | Google Maps Platform account |
| P1-WX Weather | 2 | 0 | 0 | 2 | Weather API account; GMet alert feed |
| P1-HAZ Hazard radar | 3 | 0 | 0 | 3 | NRSA hotspot data, field drive-through, Twi audio |
| P1-OFF Offline | 2 | 1 | 1 | 0 | Hazard radar (offline alerts) |
| P1-NOTIF Notifications | 3 | 1 | 0 | 2 | Firebase (push); hazard radar |
| P1-ADMIN Admin dashboard | 7 | 5 | 1 | 1 | Hosted Supabase (real TOTP sign-in) |
| P1-LEGAL Legal and privacy | 6 | 4 | 2 | 0 | Lawyer-approved texts; hosted delete-account function |
| **Total** | **41** | **20** | **7** | **14** | |

---

## P1-ACC Accounts

### P1-ACC-01 Search without an account · Must · Owner: product lead · **Done**
As a traveller, I want to search fares without signing up, so that I can use the app the first time I open it.
- Given I have never signed in, when I search Circle → Kasoa, then I see the fares.
- Given I am signed out, when I tap "Report what you paid", then I am asked to sign in. Searching never asks.

Tests: *reports › signed out: asked to sign in first*; *saved › signed out: saving asks to sign in*; database test "Signed-out traveller can search fares but cannot write reference data".

### P1-ACC-02 Sign in with phone number and SMS code · Must · Owner: tech lead · **Built**
As a traveller who wants to report fares, I want to sign in with my phone number and a code by SMS, so that I don't need a password.
- Given I type 024 123 4567, +233 24 123 4567 or 233241234567, then it is accepted as the same Ghana mobile number. A landline or a foreign number is refused with "Enter a valid Ghana mobile number."
- When I ask for a code, then an SMS arrives through Hubtel. If Hubtel fails, it goes through Arkesel.
- I cannot request another code within 60 seconds. A wrong code shows an error and does not sign me in.
- Phone numbers never appear in full in logs.

Tests: `packages/shared/test/shared.test.ts` › phone; `supabase/functions/_shared/sms/failover_test.ts`.
**Still to verify:** a real SMS through Hubtel and Arkesel on a hosted Supabase project. This needs the vendor accounts and a registered sender ID.

### P1-ACC-03 Choose English or Twi · Must · Owner: product lead · **Built**
As a Twi speaker, I want the app in Twi, so that I understand fares and warnings.
- When I choose Twi in Settings, then every screen uses Twi. The choice is remembered.
- A phone set to Akan/Twi starts in Twi.
- Every English string has a Twi string with the same placeholders.

Tests: *saved › switch the app to Twi and back*; `shared.test.ts` › translations.
**Still to verify:** a native Twi speaker reviews every string (Phase 0 doc 6.4).

### P1-ACC-04 Old app versions are asked to update · Must · Owner: tech lead · **Done**
As the operator of the service, I want to stop unsupported app versions, so that a critical fix reaches everyone.
- Given `app_versions.min_supported` for Android is above my version, when I open the app, then I see "This version is no longer supported" and an Update button.
- When the version check cannot reach the server, the app opens normally.

Tests: *saved › unsupported app version is asked to update*; *reports › offline: saved fares and the fair-price check still work* (the app opens with no server); `shared.test.ts` › app version check.

## P1-FARE Fare directory

### P1-FARE-01 See every option between two stations · Must · Owner: product lead · **Done**
As a traveller, I want to pick where I start and where I'm going, so that I see every way to travel and what it costs.
- Each option shows the operator and vehicle, the official fare, what people paid this week (median of reports not rejected), and the date it was last checked.
- Each option also shows the departure pattern ("Leaves when full", first and last departure).
- The cheapest option is listed first.
- Choosing the same start and destination is refused.

Tests: *reports › report what you paid (online)* (search and results); *saved › same start and destination is refused*; database tests "expected 2 Circle->Asafo options", "cheapest option first", "median includes the new report".

### P1-FARE-02 Know how fresh a fare is · Must · Owner: data lead · **Done**
As a traveller, I want to know whether a price is recent, so that I know how much to trust it.
- Checked within 30 days: "Recently confirmed". Within 90 days: "May have changed". Older: "Old price, check before you travel", in warning colour.

Tests: `shared.test.ts` › "lowers confidence as a fare ages".

### P1-FARE-03 Legal stop fares on a route · Should · Owner: product lead · **Not started**
As a trotro passenger, I want to see the legal fare to each stop on the route, so that I can spot short dropping (a journey split into several paid trips).
- Given Circle → Kasoa has legal stops, when I open it, then I see each stop with its fare from the start.
- The full-route fare is shown upfront, next to the sum of the stop fares.

Notes: `route_stops` already exists. Needs a stops editor in the admin and stop fares in the field data.

### P1-FARE-04 Fast and light on a cheap phone · Must · Owner: QA · **Not started**
As a traveller on 3G with a small data bundle, I want results quickly without using much data.
- Fare search results appear in under 2 seconds on 3G.
- A typical fare search session uses under 5 MB.
- The installed app is under 30 MB. It runs smoothly on Android 8 with 2 GB RAM.

Notes: needs the device lab (3–5 low- and mid-range phones) and network throttling (Phase 0 doc 8.6).

## P1-ALERT Fair price check

### P1-ALERT-01 Check a quoted fare · Must · Owner: product lead · **Done**
As a passenger, I want to type the fare I'm being asked and see whether it's fair.
- More than 10% above the official fare (or above this week's median when there is no official fare): "Above normal fare" in red, with how much more.
- Within 10%: "Normal fare". More than 10% below: "Below normal fare". Nothing to compare: "We do not know this fare yet."
- Amounts like "20", "20.50", "GH¢ 20" and "20,50" are all understood.

Tests: `shared.test.ts` › fair price check and money; *reports › one-tap overcharge report*.

### P1-ALERT-02 Overcharge check on a trotro (Phase 0 doc example) · Must · Owner: product lead · **Built**
As a trotro passenger, I want to type the fare the mate asks for, so that I know if I am being overcharged.
- Given the route Circle to Kasoa with an official fare of GH¢11, when I enter GH¢20, then the app shows "Above normal fare" in red, with the official and typical fares.
- When I am offline, the check still works using the last saved fares and shows the date they were saved.
- The result appears in under 1 second on a phone with 2 GB RAM. **Not yet measured on a device.**
- I can report the overcharge from the result screen in one tap.

Tests: `shared.test.ts` › "flags Circle to Kasoa at GH¢20…"; *reports › offline: saved fares and the fair-price check still work*; *reports › one-tap overcharge report (P1-ALERT-02)*.

## P1-REPORT Crowd reports

### P1-REPORT-01 Report what I paid · Must · Owner: product lead · **Done**
As a traveller, I want to say what I paid after a trip, so that fares stay current for everyone.
- From any fare option, I can enter the amount and say whether I travelled today or yesterday, then send.
- The report is stored as "pending" with my account, the route, operator, vehicle and class.
- It counts towards "People paid this week" unless a moderator rejects it.

Tests: *reports › report what you paid (online)*; database tests "median includes the new report" and "rejected report left out of the median".

### P1-REPORT-02 Reports work without signal · Must · Owner: tech lead · **Done**
As a traveller on a highway with no signal, I want my report kept and sent later.
- Without signal, the report is saved on the phone. I see "Saved on your phone. It will send when you are back online."
- The home screen shows "Reports waiting to send: N" until it is sent.
- It sends automatically when the app opens, comes back to the screen, the network returns, or I sign in.
- If the server stored it but the phone lost the reply, sending again does not create a second report.

Tests: *reports › offline report is queued, then stored exactly once*; `packages/shared/test/outbox.test.ts`; database test "duplicate client_id was accepted".

### P1-REPORT-03 Fake and abusive reports are limited · Must · Owner: tech lead · **Done**
As the operator, I want limits on reports, so that one person cannot flood the fares.
- More than 20 reports per user per hour are refused.
- A user cannot report on behalf of someone else, or read other people's reports.
- Amounts must be positive and under GH¢100,000.

Tests: database tests "rate limit not enforced", "report for another user was accepted", "B cannot read A's reports", "GH¢100,000 report accepted".

### P1-REPORT-04 Reporting can be switched off · Should · Owner: tech lead · **Done**
As the operator, I want to turn reporting off without an app update, for example during abuse.
- With `phase1.fare_reports` off, the report buttons disappear. The switch is cached for offline use and can be limited to cities or a percentage of devices.

Tests: *reports › feature switch off hides reporting*; `outbox.test.ts` › feature switches.

### P1-REPORT-05 Report short dropping with the vehicle plate · Should · Owner: product lead · **Not started**
As a passenger, I want to report being dropped short or overcharged with the time, route and optional number plate.
- I can choose "Short drop" or "Overcharge", add the plate and a note (up to 500 characters), and send in one screen.
- The plate is removed after 90 days (retention).

Notes: the database already supports this (`overcharge_reports.kind`, `vehicle_plate`, retention), and moderators see it. Only the app screen is missing.

## P1-TRIP Route and ETA (blocked: Google Maps Platform account)

### P1-TRIP-01 See the route on a map · Must · Owner: tech lead · **Not started**
- Given a chosen trip, I see the route on a map. The map only loads when I open it (data use).

### P1-TRIP-02 Honest travel time with live traffic · Must · Owner: tech lead · **Not started**
- I see an arrival range (for example "4 h 30 – 6 h"), not one exact time. It uses live traffic plus crowd delay reports for the N6.
- Common routes are cached to control Google Maps cost.

### P1-TRIP-03 Walking directions to the station · Should · Owner: product lead · **Not started**
- From my location, I get walking directions to the right station or loading bay. This is often the hardest part for visitors.

## P1-WX Weather (blocked: weather API account)

### P1-WX-01 Weather along the trip · Should · Owner: tech lead · **Not started**
- I see the weather at the start, along the route, and at my destination for my arrival time.

### P1-WX-02 Storm warning · Should · Owner: tech lead · **Not started**
- When heavy rain, flooding or harmattan dust is forecast on my route, I see a warning before I leave.

## P1-HAZ Hazard radar (blocked: hotspot data, field drive-through, Twi audio)

### P1-HAZ-01 Audio alert near N6 hotspots · Must · Owner: product lead · **Not started**
- While travelling on the N6, I hear an alert in English or Twi when approaching a hotspot (within its alert radius).
- Battery use stays under 5% per hour of driving.

### P1-HAZ-02 One-tap hazard report · Must · Owner: product lead · **Not started**
- I can report a crash, closure, road works, flooding or checkpoint at my location in one tap.
- Accepted reports are shown to others without my identity and expire after 6 hours.

Notes: the database side exists (`hazard_reports`, moderation, `live_hazard_reports()` without reporter identity).

### P1-HAZ-03 Diversion when a road is closed · Should · Owner: data lead · **Not started**
- When a closure is reported on a hotspot, I see the tested diversion route.

## P1-OFF Offline

### P1-OFF-01 Saved fares work with no data · Must · Owner: tech lead · **Built**
- Stations, fares I've looked up, saved trips and feature switches are kept on the phone.
- Without data, they are shown with "Offline. Showing fares saved on [date]."
- Hazard alerts offline come with P1-HAZ. **Not yet built.**

Tests: *reports › offline: saved fares and the fair-price check still work*.

### P1-OFF-02 Reports queue offline · Must · Owner: tech lead · **Done**
See P1-REPORT-02.

## P1-NOTIF Notifications

### P1-NOTIF-01 Saved trips and fare-change alerts in the app · Must · Owner: product lead · **Done**
As a daily commuter, I want to save my usual trips and know when their fare changes.
- On the results screen, I can save the trip. Saved trips are listed on the home screen, and I can remove them.
- When staff or an import change a saved route's fare, I see "Fare changes on your trips: N new". The alert shows the old and new price. Opening it marks it read.
- Confirming an unchanged fare does not alert anyone. People who turned alerts off, or didn't save the route, get nothing.

Tests: *saved › save a trip, see it on home*; *saved › fare change shows as an alert and is marked read*; *saved › alert opens the fares*; *saved › remove a saved trip*; database tests "one alert for the saver" and "alerts off: nothing".

### P1-NOTIF-02 Push notification for fare changes · Should · Owner: tech lead · **Not started**
- When a saved route's fare changes, I get a phone notification even with the app closed (Android, and iPhone once the web app is added to the home screen).

Notes: needs the push vendor (Firebase). The alerts already exist in the database; push only delivers them.

### P1-NOTIF-03 Hazard alerts on the N6 · Must · Owner: product lead · **Not started**
See P1-HAZ-01.

## P1-ADMIN Admin dashboard

### P1-ADMIN-01 Staff sign-in with two-factor · Must · Owner: tech lead · **Built**
- Staff sign in with email and password, then an authenticator-app code. They enrol the app on first sign-in.
- Without the second factor, a staff account has no staff powers. This is enforced by the database, not just the dashboard.

Tests: database test "staff without two-factor cannot edit fares"; database test "moderator without two-factor moderated".
**Still to verify:** the full sign-in and enrolment screens against hosted Supabase Auth.

### P1-ADMIN-02 Stations editor · Must · Owner: data lead · **Done**
- Add and edit stations with agreed spelling, short id, type, city, region, GPS and GhanaPostGPS.
- Coordinates outside Ghana are refused, which catches swapped latitude and longitude.

Tests: *admin › stations: add with coordinates*, *stations: swapped coordinates rejected*, *stations: edit*.

### P1-ADMIN-03 Routes, operators and fare sources · Must · Owner: data lead · **Done**
Tests: *admin › operators and sources: add*, *routes: add*.

### P1-ADMIN-04 Fares: add, confirm, change with history · Must · Owner: data lead · **Done**
- Adding a second current fare for the same route, operator, vehicle and class is refused with a clear message.
- "Change" closes the old fare and adds the new one, keeping history. "Still correct" updates the last-checked date.
- Every staff change is in the audit log with who made it.

Tests: *admin › fares: add, duplicate refused, change keeps history, confirm*; database test "fare edits audited with actor".

### P1-ADMIN-05 Spreadsheet import · Must · Owner: data lead · **Done**
- Templates for stations and fares. A CSV from Google Sheets, Excel or KoboToolbox.
- Every problem is shown with its line number before anything is saved. Valid rows are then imported, each with a result:
  - **added**
  - **confirmed:** same price
  - **price changed:** history kept
  - **skipped:** older than the last check
  - **failed:** with the reason

Tests: *import ›* all steps; `packages/shared/test/imports.test.ts`; database test "Spreadsheet import".

### P1-ADMIN-06 Moderate reports · Must · Owner: data lead · **Done**
- Moderators see pending fare, overcharge and hazard reports, oldest first, and accept or reject them.
- They cannot change the amounts. The decision records who made it.

Tests: *admin › reports: accept and reject*; database test "moderators cannot edit report amounts".

### P1-ADMIN-07 Hazard zone editor · Must · Owner: data lead · **Not started**
- Staff draw or enter hotspots and diversions, set the alert radius and attach the audio clip.

## P1-LEGAL Legal and privacy

### P1-LEGAL-01 Agree to terms before reporting · Must · Owner: compliance owner · **Built**
- Before my first report, I see a plain summary and tap "I agree". News is a separate, optional choice.
- Each answer is stored with the date, the document version and the app version.
- When the terms change version, I am asked again.
- The database refuses reports from anyone whose latest answer is not "yes".

Tests: *privacy › first report asks for agreement, then works*; database tests "report accepted without consent" and "report accepted after consent withdrawn"; `packages/shared/test/legal.test.ts`.
**Still to verify:** the lawyer-approved terms and privacy notice (English and Twi), linked through `EXPO_PUBLIC_LEGAL_URL`.

### P1-LEGAL-02 See and change consent · Must · Owner: compliance owner · **Done**
- Settings → Privacy and your data shows when I agreed. I can turn news on and off. Each change is a new record, never an edit.

Tests: *privacy › turning marketing off adds a new record*.

### P1-LEGAL-03 Correct my data · Must · Owner: compliance owner · **Done**
Tests: *privacy › correct my details*.

### P1-LEGAL-04 Download my data · Must · Owner: compliance owner · **Done**
- I get a file with my profile, consents, devices, saved trips, planned trips, reports and alerts.

Tests: *privacy › download my data*; database test "export includes own report".

### P1-LEGAL-05 Delete my account · Must · Owner: compliance owner · **Built**
- After confirming, my account and personal data are deleted. Fares I reported stay, without my id.
- Reports still waiting on my phone are discarded.

Tests: *privacy › delete my account* (the edge function call is simulated).
**Still to verify:** the `delete-account` edge function on hosted Supabase.

### P1-LEGAL-06 Keep data no longer than needed · Must · Owner: compliance owner · **Done**
- Every night:
  - reports lose their link to the user after 90 days
  - trip summaries are deleted after 12 months
  - alerts after 90 days
  - the weather cache after 7 days

Tests: database tests "old report anonymised", "trip older than 12 months deleted, recent kept", "old weather deleted", "old alert deleted".
**Still to confirm:** the retention periods with the lawyer (ADR 0012).

## Not in Phase 1

These are listed so they aren't added by accident (Phase 0 doc 6.1):
- **Phase 2:** family tracking, SOS, SMS fallback, GMet CAP alerts.
- **Phase 3:** booking, payments, parcels, terminal maps, driver ledger.
- **Phase 4:** station queue, manifests, USSD, the N1 and N10 corridors.
