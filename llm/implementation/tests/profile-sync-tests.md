# profile-sync.test.ts

**Location**: `src/app/api/tests/profile-sync.test.ts`
**Tests**: 1

## Purpose

Tests the `/api/profile/sync` endpoint which syncs profile data from linked providers.

## Endpoint Tested

### `POST /api/profile/sync`

Synchronizes profile fields from specified provider.

```typescript
// Request body
{ provider: "nostr" | "github" | "email" }
```

## Test Coverage

### OAuth-first User Syncing Nostr Fields

**Scenario**: User has `profileSource: "oauth"` (GitHub primary) but wants to pull enhanced fields from Nostr.

**Test**:
```typescript
it("syncs enhanced fields only for OAuth-first users on Nostr provider", async () => {
  mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } })
  mockUserFindUnique.mockResolvedValue({
    profileSource: "oauth",
    primaryProvider: "github",
    pubkey: "pubkey-1",
    // Missing Nostr-only fields
    nip05: null,
    lud16: null,
    banner: null
  })

  mockFetchNostrProfile.mockResolvedValue({
    nip05: "alice@example.com",
    lud16: "alice@getalby.com",
    banner: "https://example.com/banner.jpg"
  })

  const request = new NextRequest("http://localhost/api/profile/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "nostr" }),
  })

  const response = await POST(request)

  expect(response.status).toBe(200)
  expect(mockUserUpdate).toHaveBeenCalledWith({
    where: { id: "user-1" },
    data: {
      nip05: "alice@example.com",
      lud16: "alice@getalby.com",
      banner: "https://example.com/banner.jpg"
    }
  })
  // Full sync NOT called (would overwrite OAuth fields)
  expect(mockSyncUserProfileFromNostr).not.toHaveBeenCalled()
})
```

**Why This Matters**: OAuth-first users keep their OAuth identity (username, avatar, email) but can still get Nostr-specific fields (NIP-05, Lightning address, banner).

## Mock Strategy

```typescript
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() }
  }
}))
vi.mock("@/lib/nostr-profile", () => ({
  fetchNostrProfile: vi.fn(),
  syncUserProfileFromNostr: vi.fn()
}))
```

## Missing Test Coverage

Tests needed for:
- Nostr-first user syncing (should call `syncUserProfileFromNostr`)
- OAuth provider sync (GitHub/email)
- Invalid provider parameter
- Unauthenticated requests
- User without pubkey

## Related Files

- `src/app/api/profile/sync/route.ts` - Implementation
- `src/lib/nostr-profile.ts` - Nostr fetch/sync
- `src/lib/profile-aggregator.ts` - Profile merging
- [authentication-system.md](../../context/authentication-system.md) - Profile source rules
