# 0010. SMS vendors and failover

Status: Accepted

## Context

OTP delivery cannot depend on one vendor. Hubtel and Arkesel are not built-in Supabase SMS providers.

## Decision

Supabase Auth's Send SMS hook calls the `send-sms` Edge Function. It verifies the Standard Webhooks signature and sends through Hubtel first, then Arkesel. The code talks to an `SmsProvider` interface only.

## Options considered

Twilio (supported natively by Supabase, but the Phase 0 doc chose Ghanaian vendors Hubtel and Arkesel for cost and sender ID registration).

## Consequences

Register the sender ID with both vendors. Failover is unit tested.

## Update: SMSGate until Hubtel or Arkesel are ready (October 2026)

To start testing without a vendor account, codes go through SMSGate: an Android phone running the free SMSGate app sends them from its own number, through SMSGate's cloud server. Two ways in:

- `apps/passenger/api/send-sms.ts`: the same Send SMS hook as a Vercel Function, which deploys with the website, so no Supabase CLI is needed. It checks the Standard Webhooks signature and sends through SMSGate only. This is the one in use for now.
- `SmsGateProvider` in the Edge Function, after Hubtel and Arkesel, so it becomes a last fallback once they are added.

Limits: one phone's number and SMS credit, no sender name, the phone must stay online, and phone numbers and codes pass through SMSGate's cloud server (named in the Privacy Policy). Move to Hubtel or Arkesel (Option B in `docs/supabase-setup.md`) before launch.
