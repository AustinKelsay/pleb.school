# Nostr Configuration

Deep-dive reference for `config/nostr.json` - relay sets, event types, and Nostr protocol settings.

## File Location

```text
config/nostr.json
```

## Accessor File

```text
src/lib/nostr-relays.ts
```

## Schema Overview

```json
{
  "relays": {
    "default": [],
    "content": [],
    "profile": [],
    "zapThreads": [],
    "custom": []
  },
  "eventTypes": {},
  "publishingDefaults": {},
  "features": {},
  "contentDefaults": {},
  "_comments": {},
  "_examples": {}
}
```

## Relays Configuration

### Relay Sets

| Set | Purpose | Fallback |
|-----|---------|----------|
| `default` | Primary relays for all operations | None (required) |
| `content` | Content events (optional) | Falls back to `default` |
| `profile` | Profile data (optional) | Falls back to `default` |
| `zapThreads` | ZapThreads widget | Falls back to `default` |
| `custom` | User-defined additional relays | Not auto-loaded |

### Current Default Configuration

```json
{
  "relays": {
    "default": [
      "wss://nos.lol",
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nostr.land",
      "wss://purplerelay.com",
      "wss://nostr.wine"
    ],
    "zapThreads": [
      "wss://nos.lol",
      "wss://relay.damus.io"
    ],
    "custom": []
  }
}
```

### Fallback Behavior

When calling `getRelays(set)`:

1. Try to get relays for the requested set
2. If empty or undefined, fall back to `default` set
3. De-duplicate the resulting array

```typescript
const contentRelays = getRelays('content')
// If relays.content is empty: returns relays.default
// If relays.content exists: returns relays.content (deduplicated)
```

### Relay Allowlist

The accessor creates a `RELAY_ALLOWLIST` combining all configured relay sets:

```typescript
export const RELAY_ALLOWLIST = unique(
  ['default', 'content', 'profile', 'zapThreads']
    .flatMap(set => relayConfig[set] ?? [])
    .concat(relayConfig.custom ?? [])
)
```

## Event Types (Informational)

```json
{
  "eventTypes": {
    "courseList": {
      "kind": 30004,
      "nip": "51",
      "description": "Course curation list events"
    },
    "freeContent": {
      "kind": 30023,
      "nip": "23",
      "description": "Long-form content for free resources"
    },
    "paidContent": {
      "kind": 30402,
      "nip": "99",
      "description": "Paid content events for premium resources"
    },
    "userProfile": {
      "kind": 0,
      "nip": "01",
      "description": "User metadata and profile information"
    },
    "contactList": {
      "kind": 3,
      "nip": "02",
      "description": "Contact list and relay configuration"
    }
  }
}
```

This section is **informational only** - it documents which NIPs and event kinds the platform uses but is not actively read by runtime code.

## Publishing Defaults (Advisory)

```json
{
  "publishingDefaults": {
    "tags": {
      "includeClientTag": true,
      "clientName": "pleb.school",
      "clientVersion": "1.0.0"
    },
    "timeout": 10000,
    "retryAttempts": 3
  }
}
```

| Field | Description |
|-------|-------------|
| `tags.includeClientTag` | Add client identification tag |
| `tags.clientName` | Client name for `client` tag |
| `tags.clientVersion` | Client version |
| `timeout` | Publishing timeout (ms) |
| `retryAttempts` | Retry count on failure |

**Note:** These are advisory and not all are wired into `publish-service`. Current implementation uses internal defaults.

## Features (Advisory)

```json
{
  "features": {
    "enableRealtimeSync": true,
    "cacheProfiles": true,
    "cacheEventsDuration": 300,
    "autoReconnect": true,
    "reconnectInterval": 5000,
    "maxReconnectAttempts": 10,
    "enableEventValidation": true,
    "requireSignatureVerification": true
  }
}
```

| Field | Description |
|-------|-------------|
| `enableRealtimeSync` | Real-time event sync from relays |
| `cacheProfiles` | Cache user profiles locally |
| `cacheEventsDuration` | Cache TTL in seconds (5 min default) |
| `autoReconnect` | Auto-reconnect on disconnect |
| `reconnectInterval` | Time between reconnects (ms) |
| `maxReconnectAttempts` | Max reconnect attempts |
| `enableEventValidation` | Validate event structure |
| `requireSignatureVerification` | Verify event signatures |

**Note:** These are advisory flags. The snstr-context only handles relay pool setup; other toggles require explicit wiring if needed.

## Content Defaults (Advisory)

```json
{
  "contentDefaults": {
    "courseTopics": ["bitcoin", "lightning", "nostr", "development", "education"],
    "contentTags": {
      "language": "en",
      "license": "CC-BY-4.0",
      "platform": "pleb.school"
    }
  }
}
```

Suggested default values for content creation. Not enforced by runtime.

## Usage Examples

### Get Relays

```typescript
import { getRelays, DEFAULT_RELAYS, RELAY_ALLOWLIST } from '@/lib/nostr-relays'

// Get specific relay set (with fallback)
const contentRelays = getRelays('content')
const profileRelays = getRelays('profile')
const zapRelays = getRelays('zapThreads')

// Get default relays directly
const defaults = DEFAULT_RELAYS
// or
const defaults = getRelays('default')

// Check if relay is allowed
const isAllowed = RELAY_ALLOWLIST.includes('wss://nos.lol')
```

### RelaySet Type

```typescript
import type { RelaySet } from '@/lib/nostr-relays'

function fetchEvents(relaySet: RelaySet = 'default') {
  const relays = getRelays(relaySet)
  // ...
}
```

Valid values: `'default' | 'content' | 'profile' | 'zapThreads'`

### Normalize Relay URL

```typescript
import { normalizeRelayUrl } from '@/lib/nostr-relays'

const url = new URL('wss://relay.damus.io/')
const normalized = normalizeRelayUrl(url) // "wss://relay.damus.io"
```

## Configuration Recipes

### Minimal Relay Setup

```json
{
  "relays": {
    "default": ["wss://relay.damus.io", "wss://nos.lol"]
  }
}
```

### Private Relay Instance

```json
{
  "relays": {
    "default": ["wss://my-private-relay.com"],
    "custom": ["wss://backup-relay.com"]
  }
}
```

### High-Availability Setup

```json
{
  "relays": {
    "default": [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.primal.net",
      "wss://relay.nostr.band",
      "wss://nostr.wine"
    ],
    "content": [
      "wss://nos.lol",
      "wss://relay.nostr.band"
    ],
    "profile": [
      "wss://relay.nostr.band",
      "wss://nos.lol"
    ]
  }
}
```

### ZapThreads-Specific Relays

```json
{
  "relays": {
    "default": ["wss://nos.lol", "wss://relay.damus.io"],
    "zapThreads": [
      "wss://nos.lol",
      "wss://relay.damus.io",
      "wss://relay.nostr.band"
    ]
  }
}
```

## Integration Points

### snstr-context

The `SnstrContext` provider uses `DEFAULT_RELAYS` to initialize the relay pool:

```typescript
const pool = new RelayPool(DEFAULT_RELAYS)
```

### useNostrSearch

Search uses `getRelays()` with the relay set from `content.json`:

```typescript
const config = getSearchConfig()
const searchRelays = getRelays(config.relaySet ?? 'default')
```

### Fetch Services

Various fetch services accept a `relaySet` parameter:

```typescript
// Uses relaySet from function argument, falls back to default
const events = await fetchEvents({ relaySet: 'content' })
```

## Important Notes

1. **Empty arrays trigger fallback**: An empty `relays.content` array will fall back to `relays.default` (via `getRelays()` which checks `chosen.length > 0 ? chosen : base`). This is safe but may be confusing—either omit the key entirely or populate it with intended relays.

2. **Default is required**: The `default` relay set is the fallback for everything. Always configure it.

3. **Custom relays not auto-loaded**: The `custom` array is available but not automatically used. Wire into UI if needed.

4. **Features are advisory**: Most feature flags in this config are documentation-only and require explicit code integration to enforce.

## Related Documentation

- [config-system.md](../config-system.md) - Config system overview
- [nostr-events.md](../nostr-events.md) - Event structures
- [content-config.md](./content-config.md) - Search relay configuration
