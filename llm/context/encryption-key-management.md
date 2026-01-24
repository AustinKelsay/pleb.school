# Encryption Key Management

Private key encryption for ephemeral Nostr accounts. Covers key rotation, recovery, and security considerations.

## Overview

Ephemeral Nostr private keys (for anonymous, email, and GitHub users) are encrypted at rest using AES-256-GCM. The encryption key is stored in `PRIVKEY_ENCRYPTION_KEY` environment variable.

**Important Context**: Only ephemeral, platform-generated keys are encrypted. NIP-07 users manage their own keys via browser extensions - those keys never touch our system.

## Current Implementation

**Location**: `src/lib/privkey-crypto.ts`

**Algorithm**: AES-256-GCM
- 256-bit key from environment variable
- 96-bit random IV per encryption
- 128-bit authentication tag
- Format: `base64([iv:12][tag:16][ciphertext])`

```typescript
import { encryptPrivkey, decryptPrivkey } from '@/lib/privkey-crypto'

// Encrypt before storing
const encrypted = encryptPrivkey(privkey)
await prisma.user.update({ data: { privkey: encrypted } })

// Decrypt for signing
const privkey = decryptPrivkey(user.privkey)
```

## Key Generation

Generate a cryptographically secure 256-bit key:

```bash
# Generate hex-encoded key (recommended)
openssl rand -hex 32

# Or base64-encoded
openssl rand -base64 32
```

Store in `.env.local` (never commit):
```env
PRIVKEY_ENCRYPTION_KEY=your-64-character-hex-key
```

## Key Rotation Procedure

If you need to rotate the encryption key (suspected compromise, policy requirement, etc.):

### Step 1: Prepare New Key

```bash
# Generate new key
openssl rand -hex 32
# Save as NEW_PRIVKEY_ENCRYPTION_KEY in environment
```

### Step 2: Run Migration Script

Create a migration script (not included in codebase - create as needed):

```typescript
// scripts/rotate-encryption-key.ts
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import crypto from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Validate and parse encryption key from env var
function getKeyFromEnv(envVar: string): Buffer {
  const value = process.env[envVar]
  if (!value) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${envVar} must be a 64-character hex string (256-bit key)`)
  }
  return Buffer.from(value, 'hex')
}

// Decryption with specific key
function decryptWithKey(stored: string, key: Buffer): string | null {
  try {
    const payload = Buffer.from(stored, 'base64')
    if (payload.length < 29) return null

    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// Encryption with specific key
function encryptWithKey(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

async function rotateKeys() {
  // Validate keys upfront - fail fast if misconfigured
  const oldKey = getKeyFromEnv('PRIVKEY_ENCRYPTION_KEY')
  const newKey = getKeyFromEnv('NEW_PRIVKEY_ENCRYPTION_KEY')

  const users = await prisma.user.findMany({
    where: { privkey: { not: null } },
    select: { id: true, privkey: true }
  })

  console.log(`Rotating keys for ${users.length} users...`)

  // Strategy: Continue-on-error
  // - Maximizes successful rotations even if some users fail
  // - Failed users retain old encryption (still valid with old key)
  // - Re-run script after fixing failures to complete rotation
  // Alternative: Use prisma.$transaction for all-or-nothing atomicity
  let success = 0
  const failed: string[] = []

  for (const user of users) {
    if (!user.privkey) continue

    try {
      const decrypted = decryptWithKey(user.privkey, oldKey)
      if (!decrypted) {
        console.error(`Failed to decrypt for user ${user.id}`)
        failed.push(user.id)
        continue
      }

      const reEncrypted = encryptWithKey(decrypted, newKey)

      await prisma.user.update({
        where: { id: user.id },
        data: { privkey: reEncrypted }
      })

      success++
    } catch (err) {
      console.error(`Error processing user ${user.id}:`, err)
      failed.push(user.id)
    }
  }

  console.log(`Complete: ${success} rotated, ${failed.length} failed`)
  if (failed.length > 0) {
    console.log(`Failed user IDs: ${failed.join(', ')}`)
    process.exitCode = 1 // Signal partial failure
  }
}

rotateKeys()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(async () => {
    // Use allSettled to ensure both cleanup attempts run
    const results = await Promise.allSettled([
      prisma.$disconnect(),
      pool.end()
    ])
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Cleanup ${i} failed:`, r.reason)
      }
    })
  })
```

### Step 3: Execute Migration

```bash
# Set both keys
export PRIVKEY_ENCRYPTION_KEY=old-key-here
export NEW_PRIVKEY_ENCRYPTION_KEY=new-key-here

# Run migration
npx ts-node scripts/rotate-encryption-key.ts

# Verify success, then update production env
# Replace PRIVKEY_ENCRYPTION_KEY with the new key value
```

### Step 4: Update Production

1. Deploy with new `PRIVKEY_ENCRYPTION_KEY`
2. Remove old key from all environments
3. Document rotation in security log

## Recovery Procedures

### Scenario: Encryption Key Lost

**Impact**: All encrypted private keys become unrecoverable.

**Recovery**:
1. Ephemeral accounts (anonymous, email, GitHub) lose their Nostr signing capability
2. Users must create new accounts
3. Existing purchases remain (tied to user ID, not privkey)
4. **This is acceptable** for ephemeral accounts - they're throwaway platform identities

**Prevention**:
- Store key in secure secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Maintain encrypted backup of key in separate secure location
- Document key in organization's secrets inventory

### Scenario: Key Compromised

**Impact**: Attacker can decrypt all ephemeral private keys.

**Threat Assessment**:
- Compromised keys are **platform-generated ephemeral identities**
- NOT user-controlled Nostr identities (those use NIP-07)
- Attacker could impersonate anonymous/email/GitHub users on Nostr
- Cannot access user accounts (requires session, not privkey)

**Response**:
1. Rotate key immediately using procedure above
2. Consider invalidating affected accounts (optional - depends on severity)
3. Notify affected users if required by policy
4. Audit for unauthorized Nostr activity

## Security Considerations

### Single Key Architecture

**Current**: One key encrypts all ephemeral private keys.

**Risk**: Key compromise exposes all ephemeral accounts.

**Mitigation** (threat model):
- Only ephemeral, platform-generated keys are encrypted
- NIP-07 users' real Nostr identities are never stored
- Blast radius limited to throwaway platform identities

**Future Enhancement** (optional):
Per-user key derivation would limit blast radius:
```typescript
function deriveUserKey(masterKey: Buffer, userId: string): Buffer {
  return crypto.createHmac('sha256', masterKey)
    .update(userId)
    .digest()
}
```

### No Format Versioning

**Current**: Encrypted format has no version prefix.

**Risk**: Cannot upgrade algorithm without breaking existing data.

**Future Enhancement**:
```typescript
// Current: base64([iv][tag][ciphertext])
// Better:  v1:base64([iv][tag][ciphertext])

function encryptPrivkeyV1(plain: string): string {
  const encrypted = encryptPrivkey(plain)
  return `v1:${encrypted}`
}

function decryptPrivkeyV1(stored: string): string | null {
  if (stored.startsWith('v1:')) {
    return decryptPrivkey(stored.slice(3))
  }
  // Legacy format (no prefix)
  return decryptPrivkey(stored)
}
```

### Environment Variable Security

**Requirements**:
- Never commit to version control
- Use secrets manager in production
- Rotate on personnel changes
- Audit access to production environment

**Deployment Checklist**:
- [ ] Key generated with cryptographic randomness
- [ ] Key stored in secrets manager (not plain env file)
- [ ] Access logged and auditable
- [ ] Backup exists in separate secure location
- [ ] Rotation procedure tested

## Threat Model Summary

| User Type | Key Storage | Compromise Impact |
|-----------|-------------|-------------------|
| NIP-07 | Never stored | N/A - keys stay in user's extension |
| Anonymous | Encrypted in DB | Lose throwaway platform identity |
| Email | Encrypted in DB | Lose throwaway platform identity |
| GitHub | Encrypted in DB | Lose throwaway platform identity |

The encryption protects **ephemeral platform identities**, not user-controlled Nostr identities. This context is critical when evaluating the security posture.

## Related Documentation

- [authentication-system.md](./authentication-system.md) - Ephemeral key handling in auth
- [security-patterns.md](./security-patterns.md) - General security patterns
