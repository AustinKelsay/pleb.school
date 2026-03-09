# Community Architecture

Last Updated: 2026-03-08
Status: Initial scaffold

## Purpose

This document tracks the upstream community-chat foundation for Flotilla-compatible relay interop.

## Current Boundaries

- Community runtime config lives in `config/communities.json`
- The implementation entrypoint is `src/lib/community/index.ts`
- The current runtime surface includes:
  - `src/lib/community/types.ts`
  - `src/lib/community/config.ts`
  - `src/lib/community/signer.ts`
  - `src/lib/community/reducers.ts`
  - `src/lib/community/relay-service.ts`
  - `src/lib/community/queries.ts`
  - `src/lib/community/server.ts`
  - `src/hooks/useCommunity.ts`
  - `src/app/api/community/route.ts`
  - `src/app/api/community/rooms/[roomId]/route.ts`
  - `src/app/api/community/membership/route.ts`
  - `src/app/api/community/messages/route.ts`
  - `src/app/feeds/community-feed.tsx`
  - `src/app/feeds/feeds-client.tsx`

## Model

- `Space`
  - relay-backed community boundary, comparable to a Discord server or Slack workspace
- `Room`
  - channel-like subdivision within a `Space`
- `Membership`
  - user membership state for a `Space`
- `RoomMembership`
  - user membership state for a `Room`

## First-Pass Decisions

- v1 supports a single configured `Space`
- each `Space` has one primary `relayUrl`
- the checked-in config keeps the community disabled until a real relay is wired in
- `Room` membership inherits from `Space` membership by default
- both local/server-managed keys and NIP-07 are supported signing paths
- community state remains relay-backed unless persistence becomes necessary

## Service Responsibilities

`CommunityRelayService` is the initial seam for:

- relay connection lifecycle
- NIP-42 authentication challenge signing
- relay-scoped fetch and subscribe helpers
- group metadata and membership queries
- logging and normalized relay error mapping

## Shared Query Responsibilities

`src/lib/community/queries.ts` is the canonical read path for:

- space metadata and membership reads
- room metadata and membership reads
- room message reads
- room-membership inheritance from space membership
- room-specific membership overrides when the relay exposes them

Both the server API routes and the client-side NIP-07 read path call these shared query helpers so the reducer logic stays in one place.

## Reducer Responsibilities

`src/lib/community/reducers.ts` wraps `snstr` NIP-29 helpers so the app can reduce:

- metadata
- admins
- members
- membership status

into stable app-facing state.

## Signing Boundaries

- server-managed users read and write through the `/api/community/*` routes when the server can decrypt a stored private key
- NIP-07 users can write directly from the browser, and now also read directly from the relay when `config/communities.json` marks the space as `requiresAuth`
- unsigned server API reads remain available for anonymous/public cases, but they do not satisfy NIP-42 on behalf of NIP-07-only accounts

## UI Boundary

The community UI lives at `/feeds` as the default tab in the feeds page. `/community` redirects to `/feeds`.

The whole feeds surface is gated by `config/copy.json` via `feeds.enabled`. When that flag is `false`, the header link is hidden, `/feeds` is unavailable, `/community` no longer redirects there, and sitemap generation omits the page.

The primary UI component is `src/app/feeds/community-feed.tsx`, rendered inside `src/app/feeds/feeds-client.tsx` which provides a tabbed layout (Community tab active, Activity tab placeholder).

It provides:

- compact community header with name, membership badge, join/leave button
- room sidebar (vertical on desktop, horizontal pill scroll on mobile)
- room message stream with relative timestamps
- relay-backed message publishing
- a not-configured empty state for regular users
- an admin/moderator setup checklist for Zooid relay wiring, group ids, and the `space.enabled` toggle
- all copy driven from `config/copy.json` under `feeds.community`
