# 0007. Feature switch tool

Status: Accepted

## Context

Unfinished features must ship hidden and be switchable per city or percentage.

## Decision

Use the `feature_flags` table (key, enabled, rollout_percent, cities), readable by everyone and editable by admins, with every change audited.

## Options considered

Firebase Remote Config (another vendor and console).

## Consequences

The app will read the flags at start and cache them offline (built with the first flagged feature).
