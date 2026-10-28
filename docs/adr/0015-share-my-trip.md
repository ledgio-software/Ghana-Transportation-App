# 0015. Share my trip

Status: Accepted

## Context

For safety, a traveller wants family to follow their trip until they arrive (P1-SAFE-05). The family may not have the app, and the traveller may not be signed in (phone sign-in waits on the SMS provider). Location is personal data under Act 843.

## Decision

- The live map has a "Share my trip" button. It creates a share with two parts: a random link id (in the link) and a random secret that only the traveller's phone keeps. The database stores only a hash of the secret.
- The link opens `/follow/<id>` on the website. Anyone with the link can watch; only the secret can move the dot or stop sharing. No account is linked to a share.
- While the live map is open, the phone sends its position every 20 seconds. Only the latest position is kept, never a history. Positions outside Ghana are refused.
- Sharing ends when the traveller taps "Stop sharing", when they arrive, or after 6 hours. Ending clears the position at once. The nightly job deletes shares a day after they expire.
- The table has no access rules for apps at all; everything goes through four functions (`start_trip_share`, `update_trip_share`, `end_trip_share`, `get_trip_share`).
- On Android, the live map and the family page are the website in a WebView. WhatsApp, SMS and Google Maps links open in their own apps.

## Options considered

- Requiring sign-in: links the trip to a phone number and blocks the feature until SMS sign-in works.
- Sending the position in the background with the screen off: needs a native background-location permission and Play Store review. Can come with the Play Store release.
- Keeping a trail of positions: more useful to family, but more personal data than needed.

## Consequences

The position updates only while the live map is open; the family page shows "Updated N min ago" and warns when it goes quiet. Anyone can start a share without an account; rows are small and deleted within about two days, and a limit can be added if it is abused. The Privacy Policy describes trip sharing (sections 3, 5 and 7).
