# account-linking.test.ts

**Location**: `src/lib/tests/account-linking.test.ts`
**Tests**: ~30

## Purpose

Tests provider classification helper functions used during account linking and profile display.

## Functions Tested

### `isNostrProvider(provider)`
Identifies Nostr-based providers.

| Input | Expected | Reason |
|-------|----------|--------|
| `"nostr"` | `true` | NIP-07 extension |
| `"nip07"` | `true` | Alias |
| `"anonymous"` | `false` | Platform-managed keys |
| `"github"` | `false` | OAuth |
| `"email"` | `false` | Magic link |

### `isOAuthProvider(provider)`
Identifies OAuth-based providers.

| Input | Expected | Reason |
|-------|----------|--------|
| `"github"` | `true` | GitHub OAuth |
| `"email"` | `true` | Email magic link |
| `"google"` | `true` | Google OAuth |
| `"nostr"` | `false` | Not OAuth |
| `"anonymous"` | `false` | Not OAuth |

### `isAnonymousProvider(provider)`
Identifies anonymous/ephemeral accounts.

| Input | Expected | Reason |
|-------|----------|--------|
| `"anonymous"` | `true` | Anonymous signup |
| `"anon"` | `true` | Alias |
| `"nostr"` | `false` | Real identity |
| `"github"` | `false` | Real identity |

### `getProviderPriority(provider)`
Returns numeric priority for provider hierarchy.

| Provider | Priority | Meaning |
|----------|----------|---------|
| `"nostr"` | 3 | Highest (self-sovereign) |
| `"github"` | 2 | Medium (OAuth) |
| `"email"` | 2 | Medium (OAuth) |
| `"anonymous"` | 1 | Lowest (ephemeral) |

### `compareProviders(a, b)`
Compares two providers for upgrade decisions.

| Comparison | Result | Action |
|------------|--------|--------|
| nostr > github | positive | Upgrade |
| github > anonymous | positive | Upgrade |
| anonymous < nostr | negative | Upgrade needed |
| github = email | 0 | No change |

## Edge Cases

- `null` and `undefined` inputs return safe defaults
- Case insensitivity: `"NOSTR"` treated as `"nostr"`
- Unknown providers treated as lowest priority

## Usage Context

These helpers determine:
1. Whether linking should trigger automatic primary provider change
2. Whether privkey should be nulled (Nostr link)
3. Profile source selection

## Related Files

- `src/lib/auth.ts:linkAccount()` - Uses these helpers
- [auth-upgrade-plan.md](../auth-upgrade-plan.md) - Upgrade logic
