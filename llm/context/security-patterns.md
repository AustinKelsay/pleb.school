# Security Patterns

Security implementation patterns for pleb.school. Covers input validation, audit logging, key handling, and common vulnerability prevention.

## Input Validation

### Zod Schemas

All API inputs validated with Zod:

```typescript
// src/lib/api-utils.ts
import { z } from 'zod'

const PurchaseClaimSchema = z.object({
  resourceId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  amountPaid: z.number().int().nonnegative(),
  zapReceiptId: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  paymentType: z.enum(['zap', 'manual', 'comped', 'refund']).optional()
}).refine(
  data => data.resourceId || data.courseId,
  { message: 'Provide either resourceId or courseId' }
)

// Usage in route
const result = PurchaseClaimSchema.safeParse(body)
if (!result.success) {
  return Response.json({ error: 'Validation failed', details: result.error }, { status: 400 })
}
```

### Nostr Pubkey Validation

```typescript
function verifyNostrPubkey(pubkey: string): boolean {
  return /^[a-f0-9]{64}$/i.test(pubkey)
}

// Normalize to lowercase
const normalizedPubkey = pubkey.toLowerCase()
```

### URL Validation

```typescript
const UrlSchema = z.string().url().startsWith('https://')

// For images, allow data URIs too
const ImageUrlSchema = z.string().refine(
  url => url.startsWith('https://') || url.startsWith('data:image/'),
  { message: 'Invalid image URL' }
)
```

## Cryptographic Verification

### NIP-98 Signature Verification

```typescript
// src/lib/auth.ts
import { verifySignature } from 'snstr'

async function verifyNip98Auth(event: NostrEvent, expectedPubkey: string): boolean {
  // 1. Verify signature
  if (!await verifySignature(event)) return false

  // 2. Verify pubkey matches claim
  if (event.pubkey !== expectedPubkey) return false

  // 3. Check timestamp (60s window - our implementation choice per NIP-98 suggestion)
  const age = Math.floor(Date.now() / 1000) - event.created_at
  if (age > 60 || age < -60) return false

  // 4. Validate URL tag
  const urlTag = event.tags.find(t => t[0] === 'u')
  if (!urlTag?.[1]?.includes('/api/auth/callback/nostr')) return false

  // 5. Validate method tag
  const methodTag = event.tags.find(t => t[0] === 'method')
  if (methodTag?.[1] !== 'POST') return false

  return true
}
```

### Zap Receipt Verification

```typescript
// Full verification chain for purchase claims
1. Verify receipt signature
2. Verify request signature (embedded in receipt)
3. Verify invoice hash matches request
4. Verify recipient matches content owner
5. Verify payer matches session user
6. Verify event reference matches content
```

## Private Key Handling

### Encryption at Rest

```typescript
// src/lib/privkey-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const key = Buffer.from(process.env.PRIVKEY_ENCRYPTION_KEY!, 'hex')

export function encryptPrivkey(privkey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(privkey, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptPrivkey(encrypted: string | null): string | null {
  if (!encrypted) return null
  const [ivHex, authTagHex, data] = encrypted.split(':')
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### Timing-Safe Comparison

```typescript
// Prevent timing attacks on key comparison
import crypto from 'crypto'

const storedBuffer = Buffer.from(storedPrivkey, 'utf8')
const inputBuffer = Buffer.from(privateKeyHex, 'utf8')

if (storedBuffer.length !== inputBuffer.length ||
    !crypto.timingSafeEqual(storedBuffer, inputBuffer)) {
  throw new Error('Private key mismatch')
}
```

### Session Key Exposure

```typescript
// Only include privkey in session for accounts that need it
if (user.privkey && !isNip07User(account?.provider)) {
  token.privkey = user.privkey  // Encrypted
}
// NIP-07 users never have privkey in session
```

## Rate Limiting

See [rate-limiting.md](./rate-limiting.md) for full documentation.

```typescript
// Critical: Rate limit AFTER auth verification
const isValid = await verifySignature(authEvent)
if (!isValid) return error('Invalid signature')

const rateLimit = await checkRateLimit(`nostr-auth:${pubkey}`, 10, 60)
if (!rateLimit.success) return error('Rate limited')
```

## Audit Logging

### Security Events

```typescript
// src/lib/audit-logger.ts
import { logger } from './logger'

export function logSecurityEvent(event: {
  action: string
  userId?: string
  pubkey?: string
  ip?: string
  details?: Record<string, any>
}) {
  logger.info({
    type: 'security',
    ...event,
    timestamp: new Date().toISOString()
  })
}

// Usage
logSecurityEvent({
  action: 'login_failed',
  pubkey: pubkey,
  details: { reason: 'invalid_signature' }
})

logSecurityEvent({
  action: 'purchase_claimed',
  userId: session.user.id,
  details: { resourceId, amountPaid }
})
```

### Logged Events

| Event | Data Logged |
|-------|-------------|
| `login_success` | provider, userId, pubkey |
| `login_failed` | provider, pubkey, reason |
| `account_linked` | userId, provider |
| `account_unlinked` | userId, provider |
| `purchase_claimed` | userId, contentId, amount |
| `purchase_failed` | userId, contentId, reason |
| `content_published` | userId, contentId, type |
| `admin_action` | adminId, action, target |

## Error Handling

### Generic Client Errors

Never leak implementation details:

```typescript
// WRONG: Detailed error
return Response.json({ error: 'NIP-98 URL tag missing' }, { status: 400 })

// RIGHT: Generic error, log details server-side
console.error('NIP-98 validation failed:', { reason: 'url_tag_missing', pubkey })
return Response.json({ error: 'Authentication failed' }, { status: 401 })
```

### Safe Error Messages

```typescript
const SAFE_ERRORS = {
  AUTH_FAILED: 'Authentication failed',
  RATE_LIMITED: 'Too many requests',
  NOT_FOUND: 'Not found',
  ACCESS_DENIED: 'Access denied',
  INVALID_REQUEST: 'Invalid request'
}
```

## OWASP Top 10 Prevention

### Injection Prevention

```typescript
// SQL: Use Prisma (parameterized queries)
await prisma.user.findUnique({ where: { pubkey } })

// XSS: React auto-escapes, careful with dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />

// Use DOMPurify for user content
import DOMPurify from 'dompurify'
const clean = DOMPurify.sanitize(userContent)
```

### ReDoS Prevention

```typescript
// Always escape regex special chars
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const regex = new RegExp(escapeRegExp(userInput), 'gi')
```

### CSRF Protection

NextAuth handles CSRF for auth routes. For custom forms:

```typescript
// Server actions include CSRF tokens automatically
'use server'
export async function submitForm(formData: FormData) { ... }
```

### Authentication Bypass

```typescript
// Always verify ownership
if (resource.userId !== session.user.id && !isAdmin) {
  return Response.json({ error: 'Access denied' }, { status: 403 })
}
```

## Environment Variables

**Never in config files** (client-visible):

```env
# Server-only secrets
NEXTAUTH_SECRET=...
PRIVKEY_ENCRYPTION_KEY=...
GITHUB_CLIENT_SECRET=...
EMAIL_SERVER_PASSWORD=...
KV_REST_API_TOKEN=...
DATABASE_URL=...
```

**Safe for config files** (client-visible):

```json
{
  "providers": { "github": { "enabled": true } },
  "relays": ["wss://nos.lol"]
}
```

## Admin Detection

```typescript
// src/lib/admin-utils.ts
import adminConfig from '@/config/admin.json'

export async function isAdmin(pubkey?: string): Promise<boolean> {
  if (!pubkey) return false
  return adminConfig.admins.includes(pubkey.toLowerCase())
}

// Usage in route
const session = await auth()
if (!await isAdmin(session?.user?.pubkey)) {
  return Response.json({ error: 'Admin required' }, { status: 403 })
}
```

## Related Documentation

- [authentication-system.md](./authentication-system.md) - Auth security
- [rate-limiting.md](./rate-limiting.md) - Rate limiting
- [api-patterns.md](./api-patterns.md) - API validation
