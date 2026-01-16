# Encryption Key Security Considerations

## Issue Summary

The private key encryption system uses a single master key (`PRIVKEY_ENCRYPTION_KEY`) for all ephemeral Nostr accounts. While functional, this architecture has security gaps that should be addressed.

## Current State

- **Algorithm**: AES-256-GCM (secure)
- **Key Source**: Single environment variable
- **Format**: `base64([iv:12][tag:16][ciphertext])` - no version prefix
- **Rotation**: No documented procedure
- **Recovery**: Undefined

## Identified Gaps

### 1. No Key Rotation Procedure

**Problem**: If the encryption key needs to be rotated (suspected compromise, policy requirement), there's no documented or implemented migration path.

**Impact**: Operators would need to write custom scripts to decrypt with old key and re-encrypt with new key.

**Fix Options**:
- [ ] Document manual rotation procedure (low effort)
- [ ] Create migration CLI tool in `scripts/` (medium effort)
- [ ] Add rotation support to admin dashboard (high effort)

### 2. Single Key Risk

**Problem**: One compromised key exposes all encrypted private keys.

**Mitigating Context**:
- Only ephemeral, platform-generated keys are encrypted
- NIP-07 users' real Nostr identities never touch our system
- Blast radius = throwaway platform identities, not real user identities

**Fix Options**:
- [ ] Accept risk given threat model (no change)
- [ ] Implement per-user key derivation: `HMAC(master_key, user_id)` (medium effort)
- [ ] Use HSM or cloud KMS for key management (high effort)

### 3. No Format Versioning

**Problem**: Encrypted format has no version identifier. Cannot upgrade algorithm without breaking existing data or complex migration.

**Fix Options**:
- [ ] Add version prefix to new encryptions: `v1:base64(...)` (low effort)
- [ ] Implement backward-compatible decryption that handles both formats

### 4. Undefined Recovery Process

**Problem**: No documentation on what happens if encryption key is lost or needs emergency rotation.

**Mitigating Context**:
- Ephemeral accounts can simply create new ones
- Purchases tied to user ID, not privkey
- Data loss is acceptable for ephemeral identities

**Fix Options**:
- [ ] Document recovery implications (low effort) ✓ Done in `llm/context/encryption-key-management.md`
- [ ] Implement key escrow/backup system (high effort, likely overkill)

## Recommended Priority

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| 1 | Document rotation procedure | Low | ✓ Done |
| 2 | Document recovery implications | Low | ✓ Done |
| 3 | Add format versioning | Low | Not started |
| 4 | Per-user key derivation | Medium | Not started (may be overkill) |

## Threat Model Context

This decision framework should guide prioritization:

| Question | Answer |
|----------|--------|
| What keys are encrypted? | Ephemeral, platform-generated only |
| Are user-controlled keys at risk? | No - NIP-07 keys never stored |
| What's the blast radius of key compromise? | Throwaway platform identities |
| Is this a compliance requirement? | Depends on deployment context |

## Implementation Notes

### Format Versioning (if implemented)

```typescript
// Encryption with version prefix
function encryptPrivkeyV1(plain: string): string {
  const encrypted = encryptPrivkey(plain)  // existing function
  return `v1:${encrypted}`
}

// Backward-compatible decryption
function decryptPrivkeyV1(stored: string): string | null {
  if (stored.startsWith('v1:')) {
    return decryptPrivkey(stored.slice(3))
  }
  // Legacy format (no prefix) - existing behavior
  return decryptPrivkey(stored)
}
```

### Per-User Key Derivation (if implemented)

**Note**: This is illustrative pseudocode showing the concept. Actual implementation would modify `src/lib/privkey-crypto.ts`.

```typescript
import crypto from 'crypto'

// Derive a unique key for each user from the master key
function deriveUserKey(masterKey: Buffer, userId: string): Buffer {
  return crypto.createHmac('sha256', masterKey)
    .update(`privkey-encryption:${userId}`)
    .digest()
}

// Encrypt using per-user derived key (pseudocode)
function encryptPrivkeyForUser(plain: string, userId: string): string {
  const userKey = deriveUserKey(getMasterKey(), userId)

  // Same AES-256-GCM pattern as existing encryptPrivkey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', userKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Same format: base64([iv:12][tag:16][ciphertext])
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

// Decrypt using per-user derived key (pseudocode)
function decryptPrivkeyForUser(stored: string, userId: string): string | null {
  const userKey = deriveUserKey(getMasterKey(), userId)

  const payload = Buffer.from(stored, 'base64')
  if (payload.length < 29) return null

  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)

  const decipher = crypto.createDecipheriv('aes-256-gcm', userKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
```

**Migration consideration**: Per-user keys would require re-encrypting all existing privkeys during deployment, as data encrypted with the master key cannot be decrypted with a derived user key.

## References

- Full documentation: [llm/context/encryption-key-management.md](llm/context/encryption-key-management.md)
- Implementation: [src/lib/privkey-crypto.ts](src/lib/privkey-crypto.ts)
