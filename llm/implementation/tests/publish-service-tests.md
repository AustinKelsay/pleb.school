# publish-service.test.ts

**Location**: `src/lib/tests/publish-service.test.ts`
**Tests**: 1

## Purpose

Tests that `PublishService` rejects plaintext private keys when encryption is enabled.

## Test Coverage

### Plaintext Privkey Rejection

**Scenario**: User has plaintext (unencrypted) privkey stored in database when `PRIVKEY_ENCRYPTION_KEY` is set.

**Expected**: Publish operation fails with `PRIVKEY_INVALID` error.

**Why This Matters**: If encryption is enabled but a plaintext key exists:
1. It indicates a migration gap or security issue
2. Using it would bypass the encryption requirement
3. System should fail-safe by rejecting

## Test Implementation

```typescript
it("rejects plaintext privkeys under encryption for resources", async () => {
  mockFindResource.mockResolvedValue({
    user: { privkey: HEX_PRIVKEY } // Plaintext hex, not encrypted
  })

  await expect(
    PublishService.publishDraft("draft1", "user1", { ... })
  ).rejects.toMatchObject({ code: "PRIVKEY_INVALID" })
})
```

## Mock Strategy

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    draft: { findUnique: vi.fn(), delete: vi.fn() },
    resource: { create: vi.fn() }
  }
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: vi.fn()
}))
```

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
