# View Analytics

Hybrid KV + database view counting system. KV handles hot path, database stores historical data.

## Overview

```text
Client Request
    ↓
POST /api/views (increment)
    ↓
Vercel KV (fast, atomic)
    ↓
Periodic Flush
    ↓
PostgreSQL (persistence)
```

## Database Models

```prisma
model ViewCounterTotal {
  key       String   @id        // views:{namespace}:{entityId} or views:path:/...
  namespace String              // "content", "course", "lesson", "path"
  entityId  String?             // entity ID (for ns-based keys)
  path      String?             // URL path (for views:path: variant)
  total     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ViewCounterDaily {
  id        String   @id @default(cuid())
  key       String              // Same as ViewCounterTotal.key (views:ns:id or views:path:...)
  day       DateTime            // Date truncated to day
  count     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([key, day])
}
```

## API Endpoints

### POST /api/views

Increment view count for a validated key.

```typescript
// Request (must provide key OR ns+id)
{
  key?: "views:content:abc123" | "views:path:/content/abc123"
  ns?: string
  id?: string
}

// Response
{
  key: "views:content:abc123",
  count: 42
}
```

Security hardening:
- Rate limited per client (`429` on abuse)
- Rejects invalid or unbounded key formats (`400`)

### GET /api/views

Get view count for a validated key.

```typescript
// Query params (must provide key OR ns+id)
?key=views:content:abc123
// or
?ns=content&id=abc123

// Response
{
  key: "views:content:abc123",
  count: 42
}
```

Security hardening:
- Rate limited per client (`429` on abuse)
- Rejects invalid key formats (`400`)

### POST/GET /api/views/flush

Protected endpoint to flush KV counts to database.

```typescript
// Production auth
Authorization: Bearer ${VIEWS_CRON_SECRET}

// Response
{
  flushedTotals: 5,
  flushedDaily: 12
}
```

Security hardening:
- Fails closed in production if `VIEWS_CRON_SECRET` is unset
- No longer trusts `x-vercel-cron` header by itself

## useViews Hook

```typescript
import { useViews } from '@/hooks/useViews'

function ContentPage({ contentId }) {
  // Auto-tracks view on mount (deduped per session by default)
  const { key, count } = useViews({
    ns: 'resource',
    id: contentId
  })

  return <span>{count ?? '...'} views</span>
}
```

**Options:**
- `ns` + `id`: Builds key as `views:{ns}:{id}`
- `key`: Direct key override (alternative to ns/id)
- `track`: Whether to increment (default: true)
- `dedupe`: `"session"` (default), `"day"`, or `false`

## Key Format

```typescript
// Pattern: views:{namespace}:{entityId}
"views:content:f538f5c5-1a72-4804-8eb1-3f05cea64874"
"views:course:welcome-to-pleb-school"

// Path variant
"views:path:/content/f538f5c5-1a72-4804-8eb1-3f05cea64874"
```

## KV Operations

### Increment (Atomic)

```typescript
// key is the full namespaced key, e.g., "views:content:abc"
const newCount = await kv.incr(key)
// Mark the SAME full key as dirty for later flush
await kv.sadd('views:dirty', key)
```

### Get Count

```typescript
const count = await kv.get<number>(key) || 0
```

### Flush to Database (Race-Safe)

The flush uses atomic `GETDEL` to prevent TOCTOU race conditions:

```typescript
// Get dirty keys from tracking set (these are full keys like "views:content:abc")
const keys = await kv.smembers('views:dirty')

for (const key of keys) {
  // GETDEL atomically gets value AND deletes key
  // Prevents race: if increment happens after this, it creates new key
  // IMPORTANT: key must match exactly what was used in kv.incr()
  const count = await kv.getdel<number>(key)
  if (!count) continue

  // INCREMENT by delta, not SET to absolute value
  // Allows concurrent flushes without data loss
  // Production uses ViewCounterAdapter (db-adapter.ts), never Prisma directly
  await ViewCounterAdapter.upsertTotal({
    key, namespace, entityId, total: count, increment: count
  })
}

// Clean up dirty set (safe even if keys re-added during flush)
await kv.srem('views:dirty', ...keys)
```

**Why GETDEL + INCREMENT?**

| Pattern | Problem |
|---------|---------|
| `get` then `del` | Race: increments between get/del are lost when del runs |
| `getdel` with SET | Race: concurrent flushes overwrite each other |
| `getdel` with INCREMENT | Safe: atomic read clears KV, increment adds delta to DB |

If an increment happens during flush:
1. `getdel` already captured the old value
2. `incr` creates a new counter (key was deleted)
3. `sadd` adds key back to dirty set
4. Next flush picks up the new counter

## Fallback (No KV)

When Vercel KV is not configured, falls back to database-only:

```typescript
const hasKV = Boolean(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
)

// key is the full namespaced key, e.g., "views:content:abc"
if (hasKV) {
  // Use KV for hot path
  await kv.incr(key)
} else {
  // Direct database update (same key used in both paths)
  // Use ViewCounterAdapter.upsertTotal, never Prisma directly
  await ViewCounterAdapter.upsertTotal({
    key, namespace, entityId, total: 1, increment: 1
  })
}
```

## Environment Variables

```env
# Vercel KV (required in production)
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=your-token

# Flush endpoint auth (required in production)
VIEWS_CRON_SECRET=strong-random-secret
```

## Daily Analytics

Query daily view data:

```typescript
const dailyViews = await prisma.viewCounterDaily.findMany({
  where: {
    key: `views:content:${resourceId}`,
    day: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
    }
  },
  orderBy: { day: 'asc' }
})
```

## Flush Strategy

Options for flushing KV to database:

1. **Cron job**: Scheduled flush every hour
2. **Manual**: Admin triggers flush
3. **Read-through**: Flush on read (higher latency)
4. **Threshold**: Flush when KV count exceeds threshold

Current implementation: Manual flush via admin endpoint.

## Best Practices

1. **Increment on mount**: Single increment per page load
2. **Deduplicate**: Consider session-based deduplication
3. **Flush regularly**: Don't let KV grow unbounded
4. **Monitor**: Track KV key count

## Related Documentation

- [rate-limiting.md](./rate-limiting.md) - KV usage patterns
- [api-patterns.md](./api-patterns.md) - API structure
