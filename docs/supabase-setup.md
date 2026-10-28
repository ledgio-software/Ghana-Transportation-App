# Connecting the Supabase dev project

These are the manual steps for the **development** project, reference ID `hdlyqptnrpaergvzpgks`. Staging and production follow the same steps with their own reference ID, minus the seed data and the test phone number.

Do them on your own computer, with Node 22 and this repository cloned (`npm install` done). Never commit keys, passwords or `.env` files: they are git-ignored on purpose.

| Value | Where to find it | Secret? |
| --- | --- | --- |
| Project URL: `https://hdlyqptnrpaergvzpgks.supabase.co` | Project Settings → Data API | No |
| anon / publishable key | Project Settings → API Keys | No: it ships inside the app; row level security protects the data |
| service_role / secret key | Project Settings → API Keys | **Yes**: never in the app, chat or Git |
| Database password | The one you set when creating the project | **Yes** |

## 1. Load the database

**Easiest (no tools to install):** open `supabase/setup-dev.sql` on GitHub and click **Copy raw file**. In the Supabase dashboard, open **SQL Editor → New query**, paste, and click **Run**. The last line of the result should say *"Ghana Transport database is ready: 5 stations, 4 fares"*. Use this only for the dev project, because it includes sample data.

**Or with the Supabase CLI:**

```bash
npx supabase login                                     # opens the browser
npx supabase link --project-ref hdlyqptnrpaergvzpgks   # asks for the database password
npx supabase db push --include-seed                    # all migrations + sample data (dev only)
```

`db push` lists the migrations it will apply (core, Phase 1 data, retention, admin tools, rollout default, spreadsheet import, consent, saved-route alerts) and asks you to confirm. **For staging and production, leave out `--include-seed`.** The seed is sample data from the PRD, not the verified field dataset.

**Check:** in the dashboard, Table Editor shows `stations` with 5 rows and `fares` with 4.

## 2. Turn on phone sign-in and the SMS hook

1. **Authentication → Sign In / Providers**
   - **Phone:** enable it.
   - **Email:** keep it enabled (staff sign in with email), but turn **off** "Allow new users to sign up". Staff are invited, never self-registered.
2. **Authentication → Sign In / Providers → Phone → Test phone numbers** (dev only): add `233240000001` with code `123456`. That number signs in without an SMS being sent.
3. **Authentication → Auth Hooks → Add hook → Send SMS hook**
   - Type: **HTTPS**.
   - URL: `https://hdlyqptnrpaergvzpgks.supabase.co/functions/v1/send-sms`.
   - Click **Generate secret** and copy it. It looks like `v1,whsec_…`. Save the hook.
4. **Authentication → Multi-Factor:** make sure **TOTP (authenticator app)** is enabled. Staff need it; the database refuses staff changes without it.
5. **Authentication → URL Configuration:** for local testing, set Site URL to `http://localhost:3000` (the admin).

## 3. Send sign-in codes

### Option A (no command line): SMSGate through the website

For testing and the first users, sign-in codes go through an Android phone running the free [SMSGate](https://sms-gate.app) app, via the website's `/api/send-sms` function on Vercel. Each code is sent from that phone's own number and uses its SMS credit, so the phone must stay on, online and topped up.

1. On the Android phone, install SMSGate, turn on **Cloud server**, and keep **Start on boot** on. The card shows a username and a password. They are private: never put them in the code or in chat.
2. In step 2.3, set the hook URL to `https://ghana-transportation-app-passenger.vercel.app/api/send-sms` instead of the Edge Function.
3. In **Vercel → ghana-transportation-app-passenger → Settings → Environment Variables**, add `SEND_SMS_HOOK_SECRET` (the `v1,whsec_…` secret from step 2.3), `SMSGATE_USERNAME` and `SMSGATE_PASSWORD`. Then go to **Deployments → ⋯ → Redeploy**.

**Check:** sign in with your own number; the code arrives from the SMSGate phone's number. If it does not, **Vercel → Logs** shows `send-sms:` lines (with only the last 3 digits of the number).

### Option B (for launch): the Edge Function with Hubtel or Arkesel

Create `supabase/functions/.env` (copy `supabase/functions/.env.example`) and fill in:

```bash
SEND_SMS_HOOK_SECRETS=v1,whsec_...   # the secret from step 2.3
SMS_SENDER_ID=GhTransport
SMS_ALLOW_CONSOLE=true               # dev only: log codes instead of sending, until Hubtel/Arkesel are ready
# HUBTEL_CLIENT_ID=                  # add when Hubtel is approved, then remove SMS_ALLOW_CONSOLE
# HUBTEL_CLIENT_SECRET=
# ARKESEL_API_KEY=
# SMSGATE_USERNAME=                  # optional: SMSGate as the last fallback
# SMSGATE_PASSWORD=
```

Then:

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-sms
npx supabase functions deploy delete-account
```

`send-sms` is deployed without JWT checks, as set in `supabase/config.toml`, because Supabase Auth calls it with a signed webhook instead.

**Check:** Edge Functions in the dashboard lists both functions. With `SMS_ALLOW_CONSOLE=true`, a sign-in code for a real number appears in **Edge Functions → send-sms → Logs** instead of arriving by SMS.

## 4. Create your staff (admin) login

1. **Authentication → Users → Add user → Send invitation** to your company email. Accept it and set a password.
2. **SQL Editor**, run (with your email):

```sql
insert into public.user_roles (user_id, role)
select id, r::public.app_role
from auth.users, unnest(array['admin', 'data_editor', 'moderator']) as r
where email = 'you@yourcompany.com';
```

The first time you sign in to the admin, it asks you to scan a QR code with an authenticator app (Google Authenticator, Authy). Staff powers only work after that second step.

## 5. Point the apps at the project

`apps/passenger/.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://hdlyqptnrpaergvzpgks.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

`apps/admin/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://hdlyqptnrpaergvzpgks.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

Then run them:

```bash
npm run passenger   # press "w" for the web app, or scan the QR code with Expo Go
npm run admin       # http://localhost:3000
```

## 6. Check it works end to end

**Passenger app:**
1. Search Kwame Nkrumah Circle → Kasoa. You should see the GPRTU trotro fare of GH¢11.
2. Settings → Sign in with `024 000 0001` and code `123456`.
3. Report a fare. Agree to the terms when asked.

**Admin:**
1. Sign in and set up the authenticator.
2. The report you just sent is under **Reports**. Accept it.
3. Change a fare under **Fares**.
4. On the passenger app, save that trip first. The fare change then appears as an alert.

If any step fails, note the step and the error message shown. The function logs are under **Edge Functions → Logs**, and the database errors under **Logs → Postgres**.

## 7. When a new migration is added

If you loaded the database with `setup-dev.sql`, run each new file from `supabase/migrations/` (the ones dated after your last update) in **SQL Editor → New query → Run**, oldest first. With the CLI, `npx supabase db push` does the same. For example, `20261027000100_flood_prone_stations.sql` adds the "Floods in heavy rain" setting used by the weather warnings, `20261028000100_safety.sql` adds emergency numbers, driver reports, driver ratings and the private `report-photos` storage bucket, and `20261029000100_trip_shares.sql` adds "Share my trip", and `20261030000100_partner_fare_api.sql` adds the fare API for GPRTU and other partners.
