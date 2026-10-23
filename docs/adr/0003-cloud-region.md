# 0003. Cloud provider and region

Status: Proposed

## Context

Supabase hosts on AWS. No Supabase region is in Africa. Latency to Ghana and data-location rules both matter.

## Decision

Use the Supabase region with the lowest measured latency from Accra (test eu-west-2 London and eu-central-1 Frankfurt from MTN and Telecel connections). Use separate projects for development, staging and production.

## Options considered

Self-host Supabase in an African region (more operations work).

## Consequences

Confirm with the lawyer that hosting outside Ghana is acceptable under Act 843 and say so in the privacy notice.
