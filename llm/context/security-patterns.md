# Security Patterns

Security implementation patterns for pleb.school. Covers input validation, audit logging, key handling, and common vulnerability prevention.

## Input Validation

### Zod Schemas (Zod 4)

All API inputs validated with Zod. Zod 4 uses standalone schemas for common formats:

```typescript
// src/lib/api-utils.ts
import { z } from 'zod'

const PurchaseClaimSchema = z.object({
  resourceId: z.uuid().optional(),           // Zod 4: standalone z.uuid()
  courseId: z.uuid().optional(),
  amountPaid: z.number().int().nonnegative(),
  zapReceiptId: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  paymentType: z.enum(['zap', 'manual', 'comped', 'refund']).optional()
}).refine(
  data => Boolean(data.resourceId) !== Boolean(data.courseId),
  { message: 'Provide exactly one of resourceId or courseId (not both, not neither)' }
)

// Usage in route
const result = PurchaseClaimSchema.safeParse(body)
if (!result.success) {
  // Log detailed error server-side for debugging
  console.warn('Validation failed:', result.error.issues)
  // Return generic error to client - don't leak schema structure
  return Response.json({ error: 'Validation failed' }, { status: 400 })
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

### URL Validation (Zod 4)

```typescript
// Zod 4: standalone z.url() with refinement for HTTPS
const UrlSchema = z.url().refine(
  url => url.startsWith('https://'),
  { message: 'Must use HTTPS' }
)

// For images, allow data URIs too
const ImageUrlSchema = z.union([
  z.url().refine(url => url.startsWith('https://'), { message: 'Must use HTTPS' }),
  z.string().refine(url => url.startsWith('data:image/'), { message: 'Invalid image data URI' })
])

// Data URI security: CSP restricts data: to img-src only (middleware.ts)
// Data URIs are only rendered via React's <img src>, preventing XSS execution
```

## CORS and Preflight

Cross-origin API traffic is enforced in `middleware.ts`.

### Preflight Safety Pattern

Preflight (`OPTIONS`) must return the same response object that receives CORS/security headers.
Returning a brand-new `Response` drops `Access-Control-*` and security headers.

```typescript
// middleware.ts (pattern)
const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
const isApiPreflight = isApiRoute && request.method === 'OPTIONS'

const response = isApiPreflight
  ? new NextResponse(null, { status: 200 })
  : NextResponse.next()

if (isApiRoute) {
  applyCorsHeaders(request, response)
  if (isApiPreflight) return response
}
```

### CORS Rules

- `ALLOWED_ORIGINS` controls allowed cross-origin origins (comma-separated).
- If origin is allowed:
  - `Access-Control-Allow-Origin` echoes the caller origin.
  - `Access-Control-Allow-Credentials: true` is set.
- If origin is not allowed:
  - No `Access-Control-Allow-Origin` header is returned.
  - Browser blocks the cross-origin request.

### Cache Safety (`Vary`)

Middleware adds:
- `Vary: Origin`
- `Vary: Access-Control-Request-Method`
- `Vary: Access-Control-Request-Headers`

This prevents shared caches/CDNs from reusing CORS decisions across different origins or preflight inputs.

## Cryptographic Verification

### NIP-98 Signature Verification

```typescript
// src/lib/auth.ts
import { verifySignature, getEventHash } from 'snstr'

async function verifyNip98Auth(event: NostrEvent, expectedPubkey: string): Promise<boolean> {
  // 1. Verify event ID matches hash of fields (prevents tag substitution attacks)
  // Critical: Without this, attacker could sign arbitrary data and pair with fake tags
  const computedId = await getEventHash(event)
  if (computedId !== event.id) return false

  // 2. Verify signature
  if (!await verifySignature(event.id, event.sig, event.pubkey)) return false

  // 3. Verify pubkey matches claim
  if (event.pubkey !== expectedPubkey) return false

  // 4. Check timestamp (asymmetric window: 30s future / 60s past)
  const now = Math.floor(Date.now() / 1000)
  const eventAge = now - event.created_at
  if (eventAge < -30 || eventAge > 60) return false  // allow 30s future, 60s past

  // 5. Validate URL tag (strict equality, not includes())
  const urlTag = event.tags.find(t => t[0] === 'u')
  const expectedUrl = `${process.env.NEXTAUTH_URL}/api/auth/callback/nostr`
  if (!urlTag || urlTag[1] !== expectedUrl) return false

  // 6. Validate method tag
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
import crypto from 'crypto'

// Key loaded lazily from PRIVKEY_ENCRYPTION_KEY (hex or base64, 32 bytes)
// Uses ephemeral key in development if not set

export function encryptPrivkey(plain: string | null): string | null {
  if (!plain) return null
  const key = getKeyBuffer()  // 32-byte key from env
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Payload format: base64([iv:12][tag:16][ciphertext])
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decryptPrivkey(stored: string | null): string | null {
  if (!stored) return null
  const trimmed = stored.trim()

  try {
    const payload = Buffer.from(trimmed, 'base64')
    // Expect iv(12) + tag(16) + ciphertext(>=1) = minimum 29 bytes
    if (payload.length < 29) return null

    const key = getKeyBuffer()
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')

    // Validate decrypted privkey format
    if (!/^[a-f0-9]{64}$/i.test(plain)) return null
    return plain
  } catch {
    // Auth tag failure, tampering, or other crypto error - return null safely
    return null
  }
}
```

**Payload format**: `base64([iv:12 bytes][tag:16 bytes][ciphertext])` - single base64 string, no delimiters.

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
// Signing model:
// - NIP-07 users (provider === "nostr"): Sign client-side via browser extension
//   → Never have privkey in DB or session
// - Non-NIP-07 users (anonymous, email, github): Have ephemeral keys
//   → DB stores encrypted privkey, session only carries hasEphemeralKeys flag
//   → Client fetches key on-demand via /api/profile/recovery-key when signing

// Only expose flag, never the key itself in JWT/session
token.hasEphemeralKeys = !!dbUser?.privkey
// Client checks hasEphemeralKeys to determine signing mode, then fetches
// key via /api/profile/recovery-key when server-side signing is needed
// isNip07User(provider) checks provider === "nostr"
```

## Rate Limiting

See [rate-limiting.md](./rate-limiting.md) for full documentation.

### Key Patterns

**Auth-first rate limiting** (NIP-98, NIP-07):
```typescript
// Critical: Rate limit AFTER auth verification
const isValid = await verifySignature(authEvent)
if (!isValid) return error('Invalid signature')

const rateLimit = await checkRateLimit(`nostr-auth:${pubkey}`, 10, 60)
if (!rateLimit.success) return error('Rate limited')
```

**Dual-bucket rate limiting** (Anonymous signup):
```typescript
// Per-IP limit (strict) + Global limit (backstop)
const clientIp = await getClientIp()

const perIpLimit = await checkRateLimit(`auth-anon-new:ip:${clientIp}`, 5, 3600)
if (!perIpLimit.success) throw new Error('Too many from your location')

const globalLimit = await checkRateLimit('auth-anon-new:global', 50, 3600)
if (!globalLimit.success) throw new Error('Too many attempts')
```

Per-IP blocks single attackers (5/hour); global caps total throughput for distributed attacks (50/hour).

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

## Script Exit Codes

Migration and utility scripts must correctly signal success/failure to callers (CI, shells, orchestrators).

**Pattern**: Use `process.exitCode` for partial failures, then call `process.exit()` without arguments:

```typescript
async function migrate() {
  let failed: string[] = []

  for (const item of items) {
    try {
      await processItem(item)
    } catch {
      failed.push(item.id)
    }
  }

  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`)
    process.exitCode = 1  // Signal partial failure
  }
}

migrate()
  .then(() => process.exit())  // Respects process.exitCode
  .catch((e) => { console.error(e); process.exit(1) })
```

**Common mistake**: Using `.then(() => process.exit(0))` overrides any `process.exitCode` set during execution, causing partial failures to appear successful.

**Why it matters**: Silent failures in security-critical scripts (key rotation, credential migration) can leave systems in vulnerable states without alerting operators.

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
// Detection order: 1) Database Role table, 2) Config pubkeys fallback

export async function isAdmin(session: Session | null): Promise<boolean>
export async function isModerator(session: Session | null): Promise<boolean>
export async function hasModeratorOrAdmin(session: Session | null): Promise<boolean>
export async function getAdminInfo(session: Session | null): Promise<AdminInfo>

// Usage in route
const session = await auth()
if (!await isAdmin(session)) {
  return Response.json({ error: 'Admin required' }, { status: 403 })
}

// For moderator-level access
if (!await hasModeratorOrAdmin(session)) {
  return Response.json({ error: 'Moderator access required' }, { status: 403 })
}
```

## Related Documentation

- [authentication-system.md](./authentication-system.md) - Auth security
- [rate-limiting.md](./rate-limiting.md) - Rate limiting
- [api-patterns.md](./api-patterns.md) - API validation
