# Rate Limiting

Sliding window rate limiting with Vercel KV (production) and in-memory fallback (development). Located in `src/lib/rate-limit.ts`.

## Overview

Rate limiting protects sensitive endpoints from abuse:
- Brute force attacks on verification codes
- Email flooding
- Mass account creation
- API abuse

## Usage

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const { email } = await req.json()

  // Check rate limit
  const result = await checkRateLimit(
    `email-verify:${email}`,
    RATE_LIMITS.EMAIL_VERIFY.limit,
    RATE_LIMITS.EMAIL_VERIFY.windowSeconds
  )

  if (!result.success) {
    return Response.json(
      { error: 'Too many attempts', retryAfter: result.resetIn },
      {
        status: 429,
        headers: { 'Retry-After': String(result.resetIn) }
      }
    )
  }

  // Process request...
}
```

## Preconfigured Limits

```typescript
export const RATE_LIMITS = {
  // Email verification: 5 attempts per ref (prevents brute force on 6-digit code)
  EMAIL_VERIFY: { limit: 5, windowSeconds: 3600 },

  // Send verification email: 3 per email per hour (prevents spam)
  EMAIL_SEND: { limit: 3, windowSeconds: 3600 },

  // Auth magic link: 5 per email per 15 minutes (prevents email flooding)
  AUTH_MAGIC_LINK: { limit: 5, windowSeconds: 900 },

  // Nostr auth: 10 attempts per pubkey per minute (prevents enumeration)
  AUTH_NOSTR: { limit: 10, windowSeconds: 60 },

  // Anonymous auth: 20 new accounts per hour (prevents mass account creation)
  AUTH_ANONYMOUS: { limit: 20, windowSeconds: 3600 },

  // General API rate limit
  API_GENERAL: { limit: 100, windowSeconds: 60 }
}
```

## Result Type

```typescript
type RateLimitResult = {
  success: boolean    // true if within limit
  remaining: number   // attempts remaining in window
  resetIn: number     // seconds until window resets
}
```

## Implementation

### Vercel KV (Production)

Uses atomic Lua script for thread-safe counter operations:

```lua
-- Atomic: INCR + conditional EXPIRE
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])

-- Set expiry if missing (first request or recovery)
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return {count, ttl}
```

**Properties:**
- Atomic increment and TTL check
- No race conditions
- Handles key expiry recovery
- Distributed across instances

### In-Memory Fallback (Development)

Simple Map-based implementation:

```typescript
const memoryStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimitMemory(key, limit, windowSeconds, now) {
  const existing = memoryStore.get(key)

  if (!existing || existing.resetAt <= now) {
    // New window
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds })
    return { success: true, remaining: limit - 1, resetIn: windowSeconds }
  }

  // Increment existing
  existing.count++
  return {
    success: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetIn: Math.max(0, existing.resetAt - now)
  }
}
```

**Note:** In-memory store resets on server restart and doesn't share state across instances.

## Configuration

### Environment Variables

```env
# Vercel KV (required for production rate limiting)
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=your-token
```

### Detection

```typescript
const hasKV = Boolean(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
)
```

## Key Naming Convention

Use descriptive, scoped keys:

```typescript
// Format: {action}:{identifier}
`email-verify:${email}`
`email-send:${email}`
`magic-link:${email}`
`nostr-auth:${pubkey}`
`anonymous-auth:global`  // Global limit
`api:${userId}`
```

## Error Handling

### KV Failures

On KV errors, the system **fails closed** (denies request):

```typescript
try {
  const result = await kv.eval(script, [key], [windowSeconds])
  // ...
} catch (error) {
  console.error('Rate limit check failed:', error)
  return {
    success: false,  // Fail closed
    remaining: 0,
    resetIn: windowSeconds
  }
}
```

This is critical for security-sensitive endpoints where bypassing rate limits could enable attacks.

### Client Handling

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After')
  showError(`Too many attempts. Try again in ${retryAfter} seconds.`)
}
```

## Applied Endpoints

### Authentication

| Endpoint | Limit | Key Pattern |
|----------|-------|-------------|
| Email magic link | 5/15min | `magic-link:{email}` |
| NIP-07 login | 10/min | `nostr-auth:{pubkey}` |
| Anonymous creation | 20/hour | `anonymous-auth:global` |

### Email Verification

| Endpoint | Limit | Key Pattern |
|----------|-------|-------------|
| Send verification | 3/hour | `email-send:{email}` |
| Verify code | 5/hour | `email-verify:{ref}` |

### NIP-98 Ordering

**Important:** Rate limiting must happen **after** NIP-98 cryptographic verification:

```typescript
// 1. First verify signature (proves key ownership)
const isValid = await verifySignature(authEvent)
if (!isValid) return error('Invalid signature')

// 2. Then check rate limit (legitimate user)
const rateLimit = await checkRateLimit(`nostr-auth:${pubkey}`, ...)
if (!rateLimit.success) return error('Rate limited')
```

This prevents attackers from consuming rate limit budget without proving key ownership.

## Best Practices

1. **Key Scoping**: Use specific identifiers (email, pubkey, ref) not just IP addresses
2. **Fail Closed**: Deny on rate limit check failures
3. **Informative Errors**: Return `Retry-After` header
4. **Log Abuse**: Monitor for rate limit hits indicating attacks
5. **Order Correctly**: Verify auth before rate limiting

## Related Documentation

- [authentication-system.md](./authentication-system.md) - Auth flows using rate limits
- [security-patterns.md](./security-patterns.md) - Security patterns
- [api-patterns.md](./api-patterns.md) - API error handling
