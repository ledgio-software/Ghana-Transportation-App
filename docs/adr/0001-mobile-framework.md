# 0001. Mobile framework

Status: Accepted

## Context

Android ships first. iPhone users get a web app until a native iOS app is justified. The team writes TypeScript.

## Decision

React Native with Expo (SDK 58), Expo Router, TypeScript strict. One codebase builds the Android app and the iPhone web app (PWA, `web.output = single`).

## Options considered

Flutter (heavier web output, slower on low-end phones); separate web app (two codebases).

## Consequences

Over-the-air updates through EAS. The web app cannot track location in the background (see architecture.md). A native iOS build later needs no rewrite.
