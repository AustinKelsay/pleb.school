# Community Tests

Last Updated: 2026-03-08
Status: Active

## Scope

The community relay foundation currently has test coverage in three layers:

- config validation
  - `src/lib/community/tests/config.test.ts`
- event/auth primitives
  - `src/lib/community/tests/events.test.ts`
  - `src/lib/community/tests/relay-service.test.ts`
- shared query and route behavior
  - `src/lib/community/tests/queries.test.ts`
  - `src/app/api/community/tests/write-routes.test.ts`

## What These Tests Cover

- `config/communities.json` parsing rules
- default-room and room-group resolution
- signed NIP-42 auth event generation
- community message template/signature behavior
- room-membership inheritance from space membership
- room-specific membership override handling
- write-route auth and validation failures

## What Still Needs Coverage Later

- browser NIP-07 read-path integration
- successful end-to-end join/leave/message publish against a real relay
- NIP-86 management flows
- NIP-56 moderation/report behavior
- protected/private room flows against a real Zooid/Flotilla-compatible deployment
