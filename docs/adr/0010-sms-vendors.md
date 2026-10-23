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
