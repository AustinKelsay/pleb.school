# republish-service.test.ts

**Location**: `src/lib/tests/republish-service.test.ts`
**Tests**: 16

## Purpose

Comprehensive tests for `RepublishService` covering happy paths, security enforcement, course lesson handling, and error scenarios for both resources and courses.

## Test Suites

### Privkey Handling (2 tests)

Tests that plaintext private keys are rejected when encryption is enabled.

| Test | Scenario | Expected |
|------|----------|----------|
| Resource | User has plaintext privkey | `PRIVKEY_INVALID` error |
| Course | User has plaintext privkey | `PRIVKEY_INVALID` error |

### Happy Path (2 tests)

Tests successful republishing with properly encrypted private keys.

| Test | Scenario | Verifies |
|------|----------|----------|
| Resource | Encrypted privkey, valid payload | Returns `server-sign` mode, correct event ID, DB updated |
| Course | Encrypted privkey, multiple lessons | Lesson references passed to event creator, DB updated with price |

### Event ID Persistence (2 tests)

Tests that new Nostr event IDs are correctly persisted to the database.

| Test | Scenario | Verifies |
|------|----------|----------|
| Resource | New event generated | `noteId` in result matches DB update |
| Course | New event generated | `noteId` persisted, replaces old event ID |

### Course Lesson Handling (3 tests)

Tests course-specific lesson relationship logic.

| Test | Scenario | Expected |
|------|----------|----------|
| Build refs | 3 lessons, mixed authors | All lesson references passed to `createCourseEvent` |
| Missing resources | Lesson with `resourceId: null` | `MISSING_LESSONS` error |
| No lessons | Empty lessons array | `MISSING_LESSONS` error |

### Error Scenarios (7 tests)

Tests error propagation and handling.

| Test | Scenario | Expected |
|------|----------|----------|
| Resource not found | `mockFindResource` returns null | `NOT_FOUND` error |
| Course not found | `mockFindCourse` returns null | `NOT_FOUND` error |
| Event signing fails | `createResourceEvent` throws | Error propagated |
| Course event fails | `createCourseEvent` throws | Error propagated |
| All relays fail | Relay publish rejects | `RELAY_PUBLISH_FAILED` error |
| Resource tx fails | `$transaction` rejects | Error propagated |
| Course tx fails | `$transaction` rejects | Error propagated |

## Mock Strategy

### Constants

```typescript
const HEX_PRIVKEY = "f".repeat(64)  // Plaintext 64-char hex privkey
const HEX_KEY = "1a".repeat(32)     // Encryption key
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")
```

### Mock Functions

Declared outside `vi.mock` for per-test configuration:

```typescript
const mockFindResource = vi.fn()
const mockFindCourse = vi.fn()
const mockResourceUpdate = vi.fn()
const mockCourseUpdate = vi.fn()
const mockTransaction = vi.fn()
const mockCreateResourceEvent = vi.fn()
const mockCreateCourseEvent = vi.fn()
const mockRelayPoolPublish = vi.fn()
```

### Module Mocks

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: { findUnique: mockFindResource, update: mockResourceUpdate },
    course: { findUnique: mockFindCourse, update: mockCourseUpdate },
    user: { findUnique: vi.fn() },
    $transaction: (cb) => mockTransaction(cb),
  }
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: (...args) => mockCreateResourceEvent(...args),
  createCourseEvent: (...args) => mockCreateCourseEvent(...args),
  extractNoteId: (event) => event.tags?.find(t => t[0] === "d")?.[1] ?? event.id,
}))

vi.mock("snstr", () => ({
  RelayPool: class MockRelayPool {
    publish(...args) { return mockRelayPoolPublish(...args) }
  },
}))
```

### Encrypted Privkey Helper

```typescript
async function createEncryptedPrivkey(plaintext: string): Promise<string> {
  const { encryptPrivkey } = await import("../privkey-crypto")
  return encryptPrivkey(plaintext)
}
```

## Happy Path Test Example

```typescript
it("republishes resource with encrypted privkey", async () => {
  const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

  mockFindResource.mockResolvedValue({
    id: "resource1",
    userId: "user1",
    user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1" },
  })

  mockCreateResourceEvent.mockReturnValue({
    id: "generated-event-id",
    pubkey: "pub1",
    tags: [["d", "resource1"]],
  })

  mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

  const txUpdate = vi.fn()
  mockTransaction.mockImplementation(async (cb) =>
    cb({ resource: { update: txUpdate } })
  )

  const result = await RepublishService.republishResource("resource1", "user1", {
    title: "Test", summary: "s", content: "c", price: 100,
    topics: ["bitcoin"], additionalLinks: [], type: "document",
  })

  expect(result.mode).toBe("server-sign")
  expect(result.noteId).toBe("generated-event-id")
  expect(txUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ noteId: "generated-event-id" }),
    })
  )
})
```

## Why Comprehensive Coverage

Republishing involves multiple code paths:
- Encrypted privkey decryption
- Nostr event creation and signing
- Relay publishing
- Database transaction updates
- Course lesson relationship validation

Each path must be tested for both success and failure scenarios.

## Related Tests

- [publish-service-tests.md](./publish-service-tests.md) - Initial publish checks
- [privkey-crypto-tests.md](./privkey-crypto-tests.md) - Encryption implementation

## Related Files

- `src/lib/republish-service.ts` - Implementation
- `src/lib/privkey-crypto.ts` - Encryption utilities
- `src/lib/nostr-events.ts` - Event creation
