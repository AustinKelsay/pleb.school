# account-linking.test.ts

**Location**: `src/lib/tests/account-linking.test.ts`
**Tests**: 40

## Purpose

Tests provider classification helper functions used during account linking and profile sync decisions.

## Functions Tested

### `isNostrFirstProvider(provider)`
Determines if a provider uses Nostr-first logic (Nostr profile is source of truth).

| Input | Expected | Reason |
|-------|----------|--------|
| `"nostr"` | `true` | NIP-07 extension login |
| `"anonymous"` | `true` | Platform-managed Nostr keys |
| `"recovery"` | `true` | Recovery key login |
| `"email"` | `false` | OAuth-first provider |
| `"github"` | `false` | OAuth-first provider |
| `null` | `false` | Safe default |
| `undefined` | `false` | Safe default |
| `""` | `false` | Safe default |
| `"unknown"` | `false` | Unknown provider |

### `isOAuthFirstProvider(provider)`
Determines if a provider uses OAuth-first logic (OAuth profile is authoritative).

| Input | Expected | Reason |
|-------|----------|--------|
| `"email"` | `true` | Email magic link |
| `"github"` | `true` | GitHub OAuth |
| `"nostr"` | `false` | Nostr-first provider |
| `"anonymous"` | `false` | Nostr-first provider |
| `"recovery"` | `false` | Nostr-first provider |
| `null` | `false` | Safe default |
| `undefined` | `false` | Safe default |
| `""` | `false` | Safe default |

### `getProfileSourceForProvider(provider)`
Maps a provider to its profile source type (`"nostr"` or `"oauth"`).

| Input | Expected | Reason |
|-------|----------|--------|
| `"nostr"` | `"nostr"` | Nostr-first provider |
| `"anonymous"` | `"nostr"` | Nostr-first provider |
| `"recovery"` | `"nostr"` | Nostr-first provider |
| `"email"` | `"oauth"` | OAuth-first provider |
| `"github"` | `"oauth"` | OAuth-first provider |
| `"unknown"` | `"oauth"` | Fallback to OAuth |

### `shouldSyncFromNostr(user)`
Decides whether to sync profile data from Nostr. Takes a user object with optional `profileSource` and `primaryProvider` fields.

| Input | Expected | Reason |
|-------|----------|--------|
| `{ profileSource: "nostr" }` | `true` | Explicit Nostr source |
| `{ profileSource: "oauth" }` | `false` | Explicit OAuth source |
| `{ primaryProvider: "nostr" }` | `true` | Nostr-first provider fallback |
| `{ primaryProvider: "anonymous" }` | `true` | Nostr-first provider fallback |
| `{ primaryProvider: "recovery" }` | `true` | Nostr-first provider fallback |
| `{ primaryProvider: "email" }` | `false` | OAuth-first provider fallback |
| `{ primaryProvider: "github" }` | `false` | OAuth-first provider fallback |
| `{ profileSource: null, primaryProvider: null }` | `false` | Explicit nulls, safe default |
| `{}` | `false` | No data, safe default |
| `{ profileSource: "nostr", primaryProvider: "github" }` | `true` | profileSource takes precedence |
| `{ profileSource: "oauth", primaryProvider: "nostr" }` | `false` | profileSource takes precedence |

### `getProviderDisplayName(provider)`
Returns a human-friendly display name for a provider.

| Input | Expected |
|-------|----------|
| `"nostr"` | `"Nostr (NIP-07)"` |
| `"email"` | `"Email"` |
| `"github"` | `"GitHub"` |
| `"anonymous"` | `"Anonymous"` |
| `"recovery"` | `"Recovery Key"` |
| `"unknown"` | `"unknown"` (returned as-is) |

## Edge Cases

- `null` and `undefined` inputs return safe defaults (`false` for boolean functions)
- Unknown providers fall back to OAuth profile source
- `shouldSyncFromNostr()` prioritizes explicit `profileSource` over `primaryProvider`

## Usage Context

These helpers determine:
1. Profile source selection during login
2. Whether to sync profile data from Nostr on login
3. Display names for provider selection UI

## Related Files

- `src/lib/account-linking.ts` - Implementation
- `src/lib/auth.ts` - Uses these helpers during authentication
