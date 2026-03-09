# Communities Configuration

Deep-dive reference for `config/communities.json` and the community relay foundation config helpers.

## File Location

```text
config/communities.json
```

## Accessor File

```text
src/lib/community/config.ts
```

## Purpose

This config file defines the relay-backed community boundary used by the Flotilla-compatible implementation scaffold.

Unlike `config/nostr.json`, this file is not for general public relay pools. It is for authenticated community relay behavior.

## Current Scope

- v1 supports a single configured `space`
- `space.enabled` keeps the UI in a setup/empty state until a real relay is ready
- each `space` has one primary `relayUrl`
- `managementUrl` is optional for NIP-86 usage
- rooms are explicitly configured under `space.rooms`

## Shape

```json
{
  "space": {
    "id": "pleb-school",
    "name": "Pleb School Community",
    "enabled": false,
    "relayUrl": "wss://community.pleb.school",
    "managementUrl": "https://community.pleb.school",
    "groupId": "pleb-school",
    "requiresAuth": true,
    "private": false,
    "protected": false,
    "rooms": [
      {
        "id": "general",
        "name": "General",
        "groupId": "pleb-school-general",
        "default": true,
        "requiresMembership": true,
        "private": false,
        "protected": false
      }
    ]
  }
}
```

## Validation Rules

`src/lib/community/config.ts` validates:

- `space.relayUrl` must use `ws://` or `wss://`
- `space.managementUrl` must use `http://` or `https://` when present
- at least one room must exist
- exactly one room must be marked as the default room
- room IDs must be unique

## Runtime Helpers

Available helpers:

- `getCommunitiesConfig()`
- `getCommunitySpace()`
- `getCommunitySetupState()`
- `getCommunityRoom(roomId)`
- `getDefaultCommunityRoom()`
- `resolveCommunityRoomGroupId(room, space)`
- `mapSpaceConfigToSpace(space)`

## Modeling Rules

- `Space` is the server/workspace-level community boundary
- `Room` is the channel-like subdivision inside the space
- `Room` may define its own `groupId`
- when `room.groupId` is omitted, the room inherits `space.groupId`
- when `space.enabled` is `false`, the UI should render the not-configured community empty state instead of attempting relay fetches

## Important Boundary

Do not merge this config into the generic relay-set logic from `config/nostr.json`.

`nostr.json` remains the source of truth for public relay pools used by content, profiles, and zaps.
`communities.json` is the source of truth for relay-authenticated community behavior.
