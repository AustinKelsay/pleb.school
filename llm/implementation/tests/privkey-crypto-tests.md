# privkey-crypto.test.ts

**Location**: `src/lib/tests/privkey-crypto.test.ts`
**Tests**: 11

## Purpose

Tests AES-256-GCM encryption/decryption for Nostr private keys at rest.

## Functions Tested

### `encryptPrivkey(plaintext)`
Encrypts a hex private key using AES-256-GCM.

### `decryptPrivkey(ciphertext)`
Decrypts an encrypted private key.

### `privkeyEncryptionEnabled`
Boolean indicating if encryption is active.

## Test Coverage

### Key Format Acceptance
| Test | Key Format | Result |
|------|------------|--------|
| Raw hex | `"1a".repeat(32)` | Accepted |
| 0x-prefixed hex | `"0x" + "1a".repeat(32)` | Accepted |
| Base64 | `Buffer.from(...).toString("base64")` | Accepted |

### Encryption Behavior
| Test | Scenario | Expected |
|------|----------|----------|
| Round-trip | Encrypt then decrypt | Returns original |
| Null input | `encryptPrivkey(null)` | Returns null |
| Undefined input | `encryptPrivkey(undefined)` | Returns null |
| Different output | Same input twice | Different ciphertext (random IV) |

### Decryption Failures
| Test | Input | Result |
|------|-------|--------|
| Tampered ciphertext | Flipped bit | Returns null |
| Wrong key | Different encryption key | Returns null |
| Too short | Truncated payload | Returns null |
| Plaintext hex | Raw privkey | Returns null + warning |

### Always-On Encryption
| Test | Environment | Result |
|------|-------------|--------|
| Key provided | Any | Enabled |
| No key (dev) | development | Enabled (ephemeral key, warns) |
| No key (prod) | production | **Throws error** (fails fast) |

Production requires `PRIVKEY_ENCRYPTION_KEY` - the application will not start without it.

## Plaintext Rejection

Critical security test:
```typescript
it("rejects plaintext hex privkeys (always requires encryption)", async () => {
  const { decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
  const result = decryptPrivkey(HEX_PRIVKEY)  // Raw hex, not encrypted

  expect(result).toBeNull()
  expect(console.warn).toHaveBeenCalledWith(
    "Plaintext privkey encountered; rejecting. All private keys must be encrypted."
  )
})
```

This prevents accidental use of unencrypted keys.

## Cross-Key Behavior

```typescript
it("cannot decrypt with different key", async () => {
  const { encryptPrivkey } = await loadModuleWithEnv(KEY_A)
  const encrypted = encryptPrivkey(HEX_PRIVKEY)

  const { decryptPrivkey } = await loadModuleWithEnv(KEY_B)
  expect(decryptPrivkey(encrypted)).toBeNull()
})
```

## Test Helper

```typescript
async function loadModuleWithEnv(secret?: string, nodeEnv?: string) {
  vi.resetModules()
  process.env.PRIVKEY_ENCRYPTION_KEY = secret
  process.env.NODE_ENV = nodeEnv ?? "test"
  return import("../privkey-crypto")
}
```

Allows testing different environment configurations.

## Related Files

- `src/lib/privkey-crypto.ts` - Implementation
- [encryption-key-management.md](../../context/encryption-key-management.md) - Key docs
- [ENCRYPTION_KEY_SECURITY.md](../../../ENCRYPTION_KEY_SECURITY.md) - Security gaps
