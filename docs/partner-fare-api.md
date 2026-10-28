# Ghana Transport fare API for unions and operators

This document is for **GPRTU** and other unions or transport operators. It explains how to send fare changes to the Ghana Transport app automatically. When you send a new fare:

- passengers see it in the app at once;
- the old fare is kept in the history;
- people who saved that route get an alert that the fare changed.

You can send fares from your own system, a spreadsheet tool, or a short script. There is one web address and one kind of request.

## What you need

From the Ghana Transport team you get:

- a **partner key**, for example `gtp_3f9c…`. Keep it secret, like a password. If it leaks, ask us to stop it and we will give you a new one.
- the **app key**, a public key that every app request carries.
- the **address**: `https://<project>.supabase.co/rest/v1/rpc/partner_update_fares`. We fill in the exact address for you.

## Sending fares

Send an HTTPS `POST` request with these headers:

```
Content-Type: application/json
apikey: <app key>
Authorization: Bearer <app key>
```

The body is a JSON object with your partner key and a list of up to 500 fares:

```json
{
  "p_key": "gtp_your_partner_key",
  "p_fares": [
    { "origin": "kwame-nkrumah-circle", "destination": "kasoa", "vehicle_type": "trotro", "amount_ghs": 12.5 },
    { "origin": "kwame-nkrumah-circle", "destination": "fadama", "vehicle_type": "trotro", "amount_ghs": 6, "effective_from": "2026-11-01" }
  ]
}
```

Each fare has these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `origin`, `destination` | yes | Station codes from the station list (see below). |
| `amount_ghs` | yes | The fare in cedis, for example `12.5` for GH¢12.50. |
| `vehicle_type` | no (`trotro`) | `trotro`, `shared_taxi`, `bus`, and so on (see below). |
| `class` | no (`standard`) | For example `standard` or `executive`. |
| `effective_from` | no (today) | The date the fare starts, `YYYY-MM-DD`. |
| `departure_mode` | no (unchanged) | `fill_and_go` or `scheduled`. |

Every fare you send counts as an official fare of your union or company.

### Example with curl

```bash
curl -X POST "https://<project>.supabase.co/rest/v1/rpc/partner_update_fares" \
  -H "Content-Type: application/json" \
  -H "apikey: <app key>" -H "Authorization: Bearer <app key>" \
  -d '{"p_key":"gtp_your_partner_key","p_fares":[{"origin":"kwame-nkrumah-circle","destination":"kasoa","vehicle_type":"trotro","amount_ghs":12.5}]}'
```

## The answer

The answer lists one result per fare, in the order you sent them:

```json
{
  "partner": "GPRTU Greater Accra",
  "results": [
    { "line": 1, "status": "changed", "message": "was 1100 pesewas" },
    { "line": 2, "status": "error", "message": "unknown station code: kasoa-new" }
  ]
}
```

| Status | Meaning |
| --- | --- |
| `created` | A new fare for that route was added. |
| `changed` | The price changed. The old price is kept in the history and passengers who saved the route are alerted. |
| `confirmed` | The price is the same as before. It is marked as checked today. |
| `skipped` | Not changed: a newer price for that route is already in the app. |
| `error` | Not saved. The message says why, for example an unknown station or a missing price. |

A wrong or stopped partner key gets an HTTP error and nothing is saved. Fix the fares marked `error` and send just those again. Sending the same fares twice is safe: unchanged fares come back as `confirmed`.

## Station codes and vehicle types

Ask for these lists with a `GET` request and the same `apikey` and `Authorization` headers:

- Stations: `https://<project>.supabase.co/rest/v1/stations?select=slug,name,city&is_active=eq.true&order=city,name`. Use the `slug` field (for example `kwame-nkrumah-circle`) as the station code.
- Vehicle types: `https://<project>.supabase.co/rest/v1/vehicle_types?select=code,name`.

If a station you need is missing, tell us and we will add it.

## Questions

Contact the Ghana Transport team. Our staff can see every update you send, and what it changed, on the admin's **Partners** page.
