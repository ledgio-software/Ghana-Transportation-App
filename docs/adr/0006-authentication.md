# 0006. Authentication

Status: Accepted

## Context

Passengers should not need an account to search. Staff accounts can change public prices.

## Decision

Passengers sign in with a phone number and an SMS code (Supabase phone auth, Send SMS hook, ADR 0010). Staff sign in with email and password plus an authenticator-app (TOTP) code. Staff permissions apply only to `aal2` sessions, enforced in SQL. Email self sign-up is off.

## Options considered

SMS-based second factor for staff (weaker, costs money).

## Consequences

Staff accounts are invited from the Supabase dashboard and given a `user_roles` row.
