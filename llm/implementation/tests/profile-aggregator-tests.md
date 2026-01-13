# profile-aggregator.test.ts

**Location**: `src/lib/tests/profile-aggregator.test.ts`
**Tests**: 7

## Purpose

Tests `aggregateProfile()` which merges user data from multiple sources (DB, OAuth, Nostr) into a unified profile.

## Functions Tested

### `aggregateProfile(user, nostrProfile?)`

Merges profile data based on `profileSource` setting.

## Test Coverage

### OAuth-first user with Nostr profile available
- **Setup**: User with `profileSource: "oauth"`, GitHub data, and fetched Nostr profile
- **Expected**: OAuth fields take priority, Nostr-only fields (nip05, lud16, banner) merged in
- **Verifies**: `email`, `avatar`, `username` come from OAuth; `nip05`, `lud16`, `banner` from Nostr

### Nostr-first user
- **Setup**: User with `profileSource: "nostr"`, Nostr profile data
- **Expected**: All display fields come from Nostr profile
- **Verifies**: Nostr profile completely overrides OAuth data for display

### OAuth-first without Nostr profile
- **Setup**: User with `profileSource: "oauth"`, GitHub data available, `fetchNostrProfile` returns `null` (no Nostr account or profile not found)
- **Mock**: `fetchNostrProfile.mockResolvedValue(null)`
- **Expected**: OAuth fields (`username`, `email`, `avatar`) are used from GitHub; Nostr capability flags (`nip05`, `lud16`, `banner`) remain `undefined` or `null` (not set)
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
- **Setup**: User has conflicting values for fields like `username`/`avatar` across sources (e.g., GitHub username "alice", Nostr name "bob", DB username "charlie")
- **Mock**: Multiple sources with different values for same fields; `profileSource: "oauth"` vs `"nostr"` to test deterministic precedence
- **Expected**: Deterministic precedence based on `profileSource`; OAuth-first: GitHub > DB > Nostr; Nostr-first: Nostr > DB > GitHub; no random or undefined behavior
- **Verifies**: Field precedence is consistent and predictable; `username` and `avatar` follow the same priority rules; conflicting values resolve deterministically based on source order

## Mock Strategy

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findMany: vi.fn() }
  }
}))

vi.mock("@/lib/nostr-profile", () => ({
  fetchNostrProfile: vi.fn()
}))
```

## Field Priority Matrix

| Field | OAuth-first | Nostr-first |
|-------|-------------|-------------|
| username | OAuth | Nostr |
| email | OAuth | OAuth (emails come from linked OAuth accounts, not Nostr profile metadata) |
| avatar | OAuth | Nostr |
| nip05 | Nostr | Nostr |
| lud16 | Nostr | Nostr |
| banner | Nostr | Nostr |

## Related Files

- `src/lib/profile-aggregator.ts` - Implementation
- `src/app/api/profile/route.ts` - Uses aggregator
- [authentication-system.md](../../context/authentication-system.md) - Profile source rules
