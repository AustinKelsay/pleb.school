# Flotilla Community Foundation Plan

Last Updated: 2026-03-08
Status: Planned
Audience: `pleb.school` upstream implementation

## Baseline Result

- `snstr` has been bumped from `^0.2.0` to `^0.3.3` in `package.json` and `package-lock.json`.
- The upgrade was checked locally with `npm run typecheck` and `npm run lint`.
- The published `snstr` `0.3.3` root export surface now exposes the main primitives this repo needs for Flotilla-style community work:
  - NIP-42 auth helpers
  - NIP-29 group builders, parsers, reducers, and filter builders
  - NIP-56 report helpers
  - NIP-70 protected-tag helpers
  - NIP-86 relay management client
  - shared signer abstractions (`LocalKeySigner`, `Nip07Signer`, `Nip46Signer`)

## Current Repo Boundaries

The existing Nostr architecture is a usable base, but it is still optimized for content publishing and identity rather than relay-backed communities.

Relevant current seams:

- `src/lib/auth.ts`
  - already handles NIP-98 login verification
  - should remain focused on application sign-in, not long-lived relay session state
- `src/lib/nostr-relays.ts`
  - currently models public relay sets for content/profile/zaps
  - should not be overloaded with group-space semantics
- `src/lib/nostr-fetch-service.ts`
  - useful pattern for simple query wrappers
  - not sufficient on its own for authenticated relay sessions, group reducers, or room membership state
- `src/lib/publish-service.ts` and `src/lib/republish-service.ts`
  - content publishing flows should stay isolated from community chat publishing
- `src/data/types.ts`
  - currently models NIP-23, NIP-51, and NIP-99 app data
  - does not yet expose `Space`, `Room`, or membership-facing models

## Implementation Direction

The first upstream pass should add a dedicated community layer rather than mixing Flotilla flows into the content services.

Recommended new module boundary:

- `src/lib/community/`

Recommended first files:

- `src/lib/community/types.ts`
  - app-facing models for `Space`, `Room`, `Membership`, `RoomMembership`, `ModerationState`
- `src/lib/community/config.ts`
  - parsing/validation for configured community relays and named spaces
- `src/lib/community/signer.ts`
  - adapter that chooses `LocalKeySigner` vs `Nip07Signer` and leaves room for `Nip46Signer`
- `src/lib/community/relay-service.ts`
  - owns relay lifecycle, NIP-42 challenge handling, relay-scoped query helpers, and disconnect/timeout behavior
- `src/lib/community/reducers.ts`
  - wraps `snstr` NIP-29 reducers and normalizes them into app state
- `src/lib/community/queries.ts`
  - room discovery, metadata reads, membership reads, message reads
- `src/lib/community/mutations.ts`
  - join, leave, message publish, and basic moderation/report actions

## Config Shape

Do not treat Flotilla spaces as just another entry in `relays.default`.

The first implementation should introduce explicit community config, either as a new `communities` section in `config/nostr.json` or a dedicated config file.

Minimum useful config per space:

- `id`
- `name`
- `relayUrl`
- `managementUrl` if NIP-86 is exposed over HTTP separately
- `groupId`
- optional `defaultRooms`
- optional `requiresAuth`

This keeps relay-backed community boundaries explicit and avoids leaking private/community relay behavior into the public content relay pool.

## Locked First-Pass Decisions

These decisions are now fixed unless implementation uncovers a hard protocol constraint.

### Config Location

- use a new dedicated config file for communities
- do not fold community-space config into `config/nostr.json`

### Supported Signing Modes

- support both local/server-managed keys and NIP-07 in v1
- keep signer selection behind a community signer adapter so NIP-46 can be added later without changing call sites

### Persistence Strategy

- keep community state relay-backed by default
- do not mirror room membership or messages into the app database unless implementation proves it is required for correctness or a hard product requirement

### Space Scope

- v1 supports a single configured `Space`
- the app model should still use `Space` and `Room` types, even for one space, so the architecture does not need to be rewritten later

### Relay Topology

- v1 uses exactly one primary relay URL per `Space`
- model this as `relayUrl`, not `relayUrls`
- allow a separate optional `managementUrl` for NIP-86 HTTP operations

Rationale:

- this best matches the repo's current preference for clear runtime config over speculative abstraction
- it also matches the practical Flotilla/Zooid shape more closely than introducing multi-relay federation before it is needed

### Membership Model

- `Space` membership is the default access boundary
- `Room` membership inherits from `Space` membership by default
- keep a `RoomMembership` app type so room-level gating can be added later without changing the public model

Operational rule for v1:

- if the relay exposes room-specific membership or permission state, surface it
- if not, treat a valid `Space` membership as sufficient for standard room participation

### Private / Protected Support

- private/protected flows are in scope for v1, but optional and configurable per space or room
- public/community basics must work without requiring private mode

### Failure Handling

- auth and permission failures should surface a detailed user-facing error and a structured application log entry
- do not silently downgrade or mask relay-auth failures

## Error Taxonomy

Use a small explicit taxonomy that maps cleanly to UI states, logs, and retry behavior.

Recommended first-pass codes:

- `auth_required`
  - relay challenged and authentication is required before continuing
- `auth_unavailable`
  - the current signer/user context cannot satisfy relay auth
  - examples: no NIP-07 provider, no local key available, unsupported signer capability
- `auth_failed`
  - authentication was attempted but failed
  - examples: rejected challenge signature, invalid auth event, relay rejected `AUTH`
- `membership_required`
  - authenticated user is not a member of the space or room required for the action
- `permission_denied`
  - authenticated member lacks the role/capability to perform the action
- `protected_content_required`
  - action targets protected/private content but the required mode, tags, or permissions are missing
- `relay_unreachable`
  - connection could not be established
- `relay_timeout`
  - relay operation timed out after connection or during response wait
- `relay_error`
  - relay returned an unclassified protocol or transport error

Guidance:

- use these as stable app-level error codes even if lower-level relay details vary
- logs should include relay URL, space ID, room ID if applicable, user pubkey if known, operation name, and raw relay error details
- UI should show actionable detail without exposing raw protocol payloads by default

## Phase 1

Ship the protocol foundation first:

1. Add community config parsing and types.
2. Add signer selection for local key and NIP-07 flows.
3. Add a relay service that:
   - connects to a configured community relay
   - handles NIP-42 `AUTH` challenges
   - exposes relay-scoped query and subscribe helpers
   - centralizes timeout and reconnect handling
4. Add NIP-29 reduction helpers for:
   - group metadata
   - admins
   - members
   - membership status

Deliverable:

- a server/client-safe service layer that can connect to a named community relay and reduce stable room/membership state

## Phase 2

Add the first read path:

1. Fetch space metadata.
2. Fetch room metadata and room lists.
3. Fetch membership snapshots and deltas.
4. Reduce state into app-facing models.
5. Expose query helpers usable by React hooks or route handlers.

Deliverable:

- read-only community discovery with stable membership state

## Phase 3

Add the first write path:

1. Join community or room where the relay permits it.
2. Leave community or room.
3. Publish room messages.
4. Read room messages using relay-scoped filters.

Deliverable:

- basic interop with Flotilla-compatible spaces for room participation

## Phase 4

Add moderation and relay-management surfaces:

1. NIP-56 report event helpers and moderation-state mapping.
2. NIP-86 client integration for admin or operator workflows.
3. NIP-70 protected-tag handling where the relay model requires protected metadata.

Deliverable:

- protocol-complete foundation for moderation and relay management without requiring full Flotilla UI parity

## UI Scope For First Pass

The first UI should stay narrow:

- space selector or configured-space landing view
- room list
- membership status indicator
- join/leave action
- room message stream
- message composer

Avoid in the first pass:

- voice/video
- push
- full admin console
- fork-specific product logic

## Testing Priorities

Add targeted tests under `src/lib/community/tests` as the service layer lands.

Highest-priority cases:

- NIP-42 challenge signing and retry behavior
- reducer rejection of mixed-group events without explicit `groupId`
- snapshot plus delta reduction correctness
- malformed later snapshot handling
- relay-scoped query construction
- signer capability detection
- NIP-86 request/response handling

## Suggested Order Of Code Changes

1. Land the dependency baseline update.
2. Add community config and types.
3. Add signer adapter.
4. Add relay service with auth handling.
5. Add NIP-29 reducers and read queries.
6. Add join/leave/message mutations.
7. Add thin UI hooks/components on top.

## Important Constraint

Keep the upstream implementation protocol-first.

`pleb.school` already has working identity, content, and payment flows. The community foundation should compose with those existing systems, not replace them.
