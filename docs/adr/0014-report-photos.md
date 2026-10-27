# 0014. Photos on driver reports

Status: Accepted

## Context

Management asked for passengers to attach photos of the vehicle when reporting reckless driving or abuse (P1-SAFE-02). Photos can show plates, faces and places, so they are personal data under Act 843.

## Decision

- Photos go to a private Supabase Storage bucket, `report-photos` (JPEG, PNG or WebP, 5 MB each, at most 3 per report).
- Each person can only upload into a folder named after their own user id, and a report can only point at photos in that folder. Only moderators (with two-factor) can view or delete them; the admin shows them through links that expire after 10 minutes.
- The app uploads photos first and only then saves the report. Without photos, the report waits in the offline outbox like the other reports.
- After 90 days the nightly job removes the reporter and the plate from the report. Deleting a file must go through the Storage API, which SQL cannot call, so the admin shows a "Delete now" button for photos older than 90 days. It deletes the files, then clears the paths with `forget_report_photos()`.
- The app asks people to photograph the vehicle and plate, not people's faces.

## Options considered

- Deleting `storage.objects` rows in SQL: leaves the files behind.
- A scheduled Edge Function to delete old photos: the right end state once the Supabase CLI is in use; the admin button covers it until then.

## Consequences

Someone on the team must press "Delete now" when it appears, until the scheduled deletion exists. The lawyer should confirm the 90-day window for photos (ADR 0012).
