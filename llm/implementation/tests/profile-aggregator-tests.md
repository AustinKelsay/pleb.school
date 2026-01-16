# profile-aggregator.test.ts

**Location**: `src/lib/tests/profile-aggregator.test.ts`
**Tests**: 7

## Purpose

Tests `getAggregatedProfile()` which fetches user data and merges profile information from multiple sources (DB, OAuth, Nostr) into a unified profile.

## Functions Tested

### `getAggregatedProfile(userId: string)`

Fetches user data internally and aggregates profile data from all linked accounts based on `profileSource` priority.

**Parameters:**
- `userId: string` - The user ID to fetch and aggregate profile data for

**Returns:**
- `Promise<AggregatedProfile>` - An aggregated profile object containing:
  - Core fields (`name`, `email`, `username`, `image`, `banner`, `about`) with source tracking
  - Social links (`website`, `github`, `twitter`, `location`, `company`) with source tracking
  - Nostr-specific fields (`pubkey`, `nip05`, `lud16`) with source tracking
  - `linkedAccounts`: Array of all linked account data
  - `primaryProvider`: The user's primary provider
  - `profileSource`: The user's profile source preference (`"oauth"` or `"nostr"`)
  - `totalLinkedAccounts`: Count of linked accounts

**Behavior:**
- Fetches user data from the database using Prisma (includes linked accounts)
- Fetches Nostr profile data via `fetchNostrProfile()` for linked Nostr accounts
- Fetches GitHub profile data via GitHub API for linked GitHub accounts
- Applies profileSource/nostr merging behavior based on `isNostrFirstProfile()`:
  - **Nostr-first**: Nostr accounts → current DB profile → OAuth providers
  - **OAuth-first**: current DB profile → OAuth providers → Nostr accounts
- Throws `Error('User not found')` if the user doesn't exist

## Test Coverage

### OAuth-first user with Nostr profile available
- **Setup**: User with `profileSource: "oauth"`, GitHub data, and fetched Nostr profile
- **Expected**: OAuth fields take priority, Nostr-only fields (nip05, lud16, banner) merged in
- **Verifies**: `email`, `image`, `username` come from OAuth; `nip05`, `lud16`, `banner` from Nostr

### Nostr-first user
- **Setup**: User with `profileSource: "nostr"`, Nostr profile data
- **Expected**: Display fields come from Nostr profile, except email which always comes from OAuth (see Field Priority Matrix)
- **Verifies**: `username`, `image` come from Nostr; `email` still sourced from OAuth; Nostr-only fields (`nip05`, `lud16`, `banner`) from Nostr

### OAuth-first without Nostr profile
- **Setup**: User with `profileSource: "oauth"`, GitHub data available, `fetchNostrProfile` returns `null` (no Nostr account or profile not found)
- **Mock**: `fetchNostrProfile.mockResolvedValue(null)`
- **Expected**: OAuth fields (`username`, `email`, `image`) are used from GitHub; Nostr capability flags (`nip05`, `lud16`, `banner`) remain `undefined` or `null` (not set)
- **Verifies**: OAuth fields take priority when Nostr profile unavailable; Nostr-specific fields don't appear in aggregated profile; no errors thrown when Nostr profile is missing

### Partial data from OAuth or Nostr
- **Setup**: User with mixed data sources where some fields are `null` or `undefined` (e.g., OAuth provides `username` but `email` is null; Nostr provides `nip05` but `lud16` is null)
- **Mock**: OAuth data with partial fields (`{ login: "user", email: null }`), Nostr profile with partial fields (`{ nip05: "user@domain.com", lud16: null }`)
- **Expected**: Merging logic picks available fields from each source; `null`/`undefined` fields don't overwrite existing values; final profile contains only non-null fields
- **Verifies**: Safe merge behavior handles missing fields gracefully; no `null` values propagate to final aggregated profile unless all sources are null

### fetchNostrProfile error
- **Setup**: User with Nostr account linked, but `fetchNostrProfile` throws an error (network failure, invalid pubkey, relay timeout)
- **Mock**: `fetchNostrProfile.mockRejectedValue(new Error("Failed to fetch Nostr profile"))`
- **Expected**: Error is caught and handled gracefully; aggregation continues with OAuth/DB data; Nostr account appears in `linkedAccounts` but with empty/null data; no unhandled promise rejection
- **Verifies**: Error handling prevents aggregation from failing; fallback to available sources works correctly; error is logged but doesn't break the aggregation flow

### User switches profileSource
- **Setup**: User changes `profileSource` from `"oauth"` to `"nostr"` (or vice versa) between aggregations
- **Mock**: First call with `profileSource: "oauth"`, second call with `profileSource: "nostr"`; same user data but different source priority
- **Expected**: First aggregation prioritizes OAuth fields; second aggregation prioritizes Nostr fields; source precedence changes based on `profileSource` value
- **Verifies**: `profileSource` change triggers correct source precedence; `isNostrFirstProfile()` logic correctly determines priority; field sources reflect the new priority order

### Conflicting data
- **Setup**: User has conflicting values for fields like `username`/`image` across sources (e.g., GitHub username "alice", Nostr display_name "bob")
- **Mock**: OAuth and Nostr sources with different values for same fields; `profileSource: "oauth"` vs `"nostr"` to test deterministic precedence
- **Expected**: Deterministic precedence based on `profileSource`; OAuth-first: OAuth fields win; Nostr-first: Nostr fields win (see Field Priority Matrix below)
- **Verifies**: Field precedence is consistent and predictable; `username` and `image` follow the same priority rules; conflicting values resolve deterministically based on `profileSource`

## Mock Strategy

Since `getAggregatedProfile(userId)` fetches user data internally and makes external API calls, the following mocks are used:

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { 
      findUnique: vi.fn(), // Mocked to return user with linked accounts
      update: vi.fn() // Mocked to simulate username/avatar/email updates from getAggregatedProfile
    }
  }
}))

vi.mock("@/lib/nostr-profile", () => ({
  fetchNostrProfile: vi.fn() // Mocked to return Nostr profile data or null
}))

// Mock global.fetch to simulate GitHub API responses
global.fetch = vi.fn() // Mocked to return GitHub API responses for fetchGitHubProfile calls
```

**Note**: 
- `getAggregatedProfile` calls `prisma.user.findUnique({ where: { id: userId }, include: { accounts: true } })` internally, so tests mock this to return the user data structure with linked accounts.
- `getAggregatedProfile` calls `fetchGitHubProfile()` which uses `global.fetch` to call `https://api.github.com/user`, so tests mock `global.fetch` to simulate GitHub API responses.
- `getAggregatedProfile` calls `prisma.user.update()` to backfill placeholder profile fields (username, avatar, email) when richer data is available from linked providers, so tests mock this to assert username update behavior.

## Field Priority Matrix

| Field | OAuth-first | Nostr-first |
|-------|-------------|-------------|
| username | OAuth | Nostr |
| email | OAuth | OAuth (emails come from linked OAuth accounts, not Nostr profile metadata) |
| image | OAuth | Nostr |
| nip05 | Nostr | Nostr |
| lud16 | Nostr | Nostr |
| banner | Nostr | Nostr |

## Related Files

- `src/lib/profile-aggregator.ts` - Implementation
- `src/app/api/profile/route.ts` - Uses aggregator
- [authentication-system.md](../../context/authentication-system.md) - Profile source rules
