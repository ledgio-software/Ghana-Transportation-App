# 0011. Analytics and privacy rules for events

Status: Proposed

## Context

We need usage funnels without collecting raw location or phone numbers.

## Decision

Product analytics (PostHog or Firebase Analytics, to choose) gets events with route IDs and city only, never phone numbers or coordinates. Sentry for crashes, with personal data scrubbing on.

## Consequences

List each analytics vendor in the privacy notice and sign its data processing terms.
