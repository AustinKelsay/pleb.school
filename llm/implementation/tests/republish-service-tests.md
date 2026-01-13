# republish-service.test.ts

**Location**: `src/lib/tests/republish-service.test.ts`
**Tests**: 2

## Purpose

Tests that `RepublishService` rejects plaintext private keys when encryption is enabled, for both resources and courses.

## Test Coverage

### Resource Republishing
**Scenario**: User edits existing resource, has plaintext privkey.
**Expected**: `PRIVKEY_INVALID` error.

### Course Republishing
**Scenario**: User edits existing course, has plaintext privkey.
**Expected**: `PRIVKEY_INVALID` error.

## Test Implementation

### Constants and Mocks

```typescript
const HEX_PRIVKEY = "f".repeat(64)  // Plaintext 64-char hex privkey

const mockFindResource = vi.fn()
const mockFindCourse = vi.fn()
```

### Tests

```typescript
it("rejects plaintext privkeys under encryption for resources", async () => {
  mockFindResource.mockResolvedValue({
    user: { privkey: HEX_PRIVKEY } // Plaintext, not encrypted
  })

  await expect(
    RepublishService.republishResource("resource1", "user1", { ... })
  ).rejects.toMatchObject({ code: "PRIVKEY_INVALID" })
})

it("rejects plaintext privkeys under encryption for courses", async () => {
  mockFindCourse.mockResolvedValue({
    user: { privkey: HEX_PRIVKEY }
  })

  await expect(
    RepublishService.republishCourse("course1", "user1", { ... })
  ).rejects.toMatchObject({ code: "PRIVKEY_INVALID" })
})
```

## Mock Strategy

The mock functions are declared outside the `vi.mock` call so tests can configure them:

```typescript
const mockFindResource = vi.fn()
const mockFindCourse = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: { findUnique: mockFindResource, update: vi.fn() },
    course: { findUnique: mockFindCourse, update: vi.fn() },
    $transaction: async (cb) => cb({ ... })
  }
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: vi.fn().mockReturnValue({ id: "event1", ... }),
  createCourseEvent: vi.fn().mockReturnValue({ id: "event2", ... })
}))
```

## Why Separate from Publish Tests

Republishing has different code paths:
- Loads existing content from DB
- May update Nostr event (new signature)
- Involves course lesson relationships

Both paths must enforce encryption requirement.

## Related Tests

- [publish-service-tests.md](./publish-service-tests.md) - Initial publish check
- [privkey-crypto-tests.md](./privkey-crypto-tests.md) - Encryption implementation

## Related Files

- `src/lib/republish-service.ts` - Implementation
- `src/lib/privkey-crypto.ts` - Encryption utilities
