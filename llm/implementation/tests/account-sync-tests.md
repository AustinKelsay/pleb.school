# account-sync.test.ts

**Location**: `src/app/api/tests/account-sync.test.ts`
**Tests**: 2

## Purpose

Tests the `/api/account/sync` endpoint which backfills missing user data from linked accounts.

## Endpoint Tested

### `POST /api/account/sync`

Syncs data from a specific linked provider (e.g., backfills email from email provider).

## Test Coverage

| Test | Scenario | Expected |
|------|----------|----------|
| Unauthenticated | No session | 401 Unauthorized |
| Email backfill | Email provider linked, user.email null | Updates user.email, returns 200 with `updated: ["email"]` |

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
    account: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() }
  }
}))
```

## Test Implementation

```typescript
it("backfills email when email provider is linked but user email is missing", async () => {
  mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } })
  mockAccountFindFirst.mockResolvedValue({
    id: "acc-1",
    provider: "email",
    providerAccountId: "User@example.com",
  })
  mockUserFindUnique.mockResolvedValue({ email: null })
  mockUserUpdate.mockResolvedValue({})

  const request = new Request("http://localhost/api/account/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "email" }),
  })

  const response = await POST(request)
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.updated).toEqual(["email"])
  expect(mockUserUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "user-1" },
      data: { email: "user@example.com" },  // normalized to lowercase
    })
  )
})
```

## Related Files

- `src/app/api/account/sync/route.ts` - Implementation
- `src/lib/auth.ts` - Account linking logic
- [authentication-system.md](../../context/authentication-system.md) - Auth overview
