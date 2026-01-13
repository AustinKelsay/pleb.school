# account-sync.test.ts

**Location**: `src/app/api/tests/account-sync.test.ts`
**Tests**: ~10

## Purpose

Tests the `/api/account/sync` endpoint which synchronizes linked accounts.

## Endpoint Tested

### `POST /api/account/sync`

Triggers synchronization of user's linked accounts.

## Test Coverage

### Authentication

| Test | Session | Expected |
|------|---------|----------|
| Authenticated | Valid session | 200 OK |
| Unauthenticated | No session | 401 Unauthorized |

### Sync Behavior

| Test | Scenario | Expected |
|------|----------|----------|
| Has linked accounts | User with GitHub + Email | Syncs all accounts |
| No linked accounts | User with only primary | Returns success (no-op) |
| Nostr account linked | User with NIP-07 | Triggers Nostr profile sync |

### Error Handling

| Test | Scenario | Expected |
|------|----------|----------|
| DB error | Prisma throws | 500 Internal Server Error |
| Partial sync failure | One account fails | Continues with others |

## Mock Strategy

```typescript
vi.mock("next-auth", () => ({
  getServerSession: vi.fn()
}))

vi.mock("@/lib/auth", () => ({
  authOptions: {}
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findMany: vi.fn(), update: vi.fn() }
  }
}))
```

## Test Implementation

```typescript
it("syncs accounts for authenticated user", async () => {
  mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } })
  mockAccountFindMany.mockResolvedValue([
    { provider: "github", providerAccountId: "123" },
    { provider: "email", providerAccountId: "test@example.com" }
  ])

  const request = new Request("http://localhost/api/account/sync", {
    method: "POST"
  })

  const response = await POST(request)
  expect(response.status).toBe(200)
})
```

## Related Files

- `src/app/api/account/sync/route.ts` - Implementation
- `src/lib/auth.ts` - Account linking logic
- [authentication-system.md](../../context/authentication-system.md) - Auth overview
