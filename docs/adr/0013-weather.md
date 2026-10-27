# 0013. Weather provider

Status: Accepted

## Context

P1-WX needs the forecast at the start, along the way and at the destination, with heavy rain and flood warnings. The app must not depend on a paid account to launch, and the Android app and the iPhone web app must behave the same.

## Decision

MET Norway's Locationforecast 2.0 (free, including commercial use, with attribution). It requires an identifying User-Agent, which a browser cannot set, so the web app's Vercel Function `apps/passenger/api/weather.ts` calls it. The function only answers for places in Ghana, rounds them to about 1 km and lets Vercel's edge cache keep each answer for 30 minutes, so busy stations cost one call per half hour. The Android app calls the same function through `EXPO_PUBLIC_WEB_URL`.

The advice ("take an umbrella", heavy rain, flood warning) is computed in the app from the forecast (`packages/shared/src/weather.ts`). Heavy rain is 7.6 mm an hour or more. Flood warnings use a `flood_prone` flag on stations that the field team sets in the admin.

## Options considered

- Open-Meteo: easy to call from the browser, but the free API is non-commercial only.
- OpenWeatherMap: needs a card and a key.
- A Supabase Edge Function instead of the Vercel Function: matches the other vendor adapters, but needs the Supabase CLI to deploy, while the Vercel Function deploys with every merge. Moving it later is a small change.

## Consequences

The app shows "Forecast from MET Norway". Harmattan dust and official warnings need the GMet alert feed later. If Vercel is replaced, the function moves with the web app.
