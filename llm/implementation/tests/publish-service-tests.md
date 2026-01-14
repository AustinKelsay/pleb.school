# publish-service.test.ts

**Location**: `src/lib/tests/publish-service.test.ts`
**Tests**: 1

## Purpose

Tests that `PublishService` rejects plaintext private keys when encryption is enabled.

## Test Coverage

### Plaintext Privkey Rejection

**Scenario**: User has plaintext (unencrypted) privkey stored in database when `PRIVKEY_ENCRYPTION_KEY` is set.

**Expected**: Publish operation fails with `PRIVKEY_NOT_AVAILABLE` error.

**Why This Matters**: If encryption is enabled but a plaintext key exists:
1. It indicates a migration gap or security issue
2. Using it would bypass the encryption requirement
3. System should fail-safe by rejecting

## Test Implementation

```typescript
import { startEphemeralRelay, stopEphemeralRelay, getRelayUrl, type NostrRelay } from "../utils/ephemeral-relay"

const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32)
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

const mockFindDraft = vi.fn()
const mockPrismaFindUser = vi.fn()

// Store relay URL for use in mocks
let ephemeralRelayUrl = "wss://relay.test"

describe("PublishService privkey handling", () => {
  let relay: NostrRelay | null = null

  beforeEach(async () => {
    // Start ephemeral relay before tests
    relay = await startEphemeralRelay(0)
    ephemeralRelayUrl = getRelayUrl(relay)

    vi.resetModules()
    vi.restoreAllMocks()
    mockFindDraft.mockReset()
    mockPrismaFindUser.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(async () => {
    // Stop ephemeral relay after tests
    if (relay) {
      await stopEphemeralRelay(relay)
      relay = null
    }
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("rejects plaintext privkeys under encryption (strict default) with PRIVKEY_NOT_AVAILABLE", async () => {
    mockFindDraft.mockResolvedValue({ id: "draft1", userId: "user1" })
    mockPrismaFindUser.mockResolvedValue({ privkey: HEX_PRIVKEY, pubkey: "pub1" })

    const { PublishService } = await import("../publish-service")

    await expect(PublishService.publishResource("draft1", "user1")).rejects.toMatchObject({
      code: "PRIVKEY_NOT_AVAILABLE",
    })
  })
})
```

## Mock Strategy

```typescript
vi.mock("@/lib/draft-service", () => ({
  DraftService: {
    findById: mockFindDraft,
  },
  CourseDraftService: {
    findById: vi.fn(),
    syncPublishedLessons: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockPrismaFindUser,
    },
  },
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: vi.fn(),
  createCourseEvent: vi.fn(),
  extractNoteId: vi.fn(),
}))

vi.mock("@/lib/nostr-relays", () => ({
  get DEFAULT_RELAYS() {
    return [ephemeralRelayUrl]
  },
  getRelays: () => [ephemeralRelayUrl],
}))
```

**Note**: The test uses an ephemeral in-memory relay from `utils/ephemeral-relay.ts` instead of a hardcoded relay URL. The relay is started in `beforeEach` and stopped in `afterEach`, ensuring each test runs with a fresh relay instance. The mock uses a getter for `DEFAULT_RELAYS` to access the runtime relay URL.

## Security Relevance

This test ensures the encryption-at-rest guarantee:
- Platform-managed keys are always encrypted in database
- Attempting to use unencrypted keys fails
- Prevents accidental exposure of plaintext keys

## Related Tests

- [republish-service-tests.md](./republish-service-tests.md) - Same check for republishing
- [privkey-crypto-tests.md](./privkey-crypto-tests.md) - Encryption implementation

## Related Files

- `src/lib/publish-service.ts` - Implementation
- `src/lib/privkey-crypto.ts` - Encryption utilities
- [encryption-key-management.md](../../context/encryption-key-management.md) - Key docs
