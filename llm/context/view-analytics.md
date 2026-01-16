# View Analytics

Hybrid KV + database view counting system. KV handles hot path, database stores historical data.

## Overview

```
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
  key       String   @id        // "resource:uuid" or "course:uuid"
  namespace String              // "resource" or "course"
  entityId  String?             // UUID of content
  path      String?             // URL path (optional)
  total     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ViewCounterDaily {
  id        String   @id @default(cuid())
  key       String              // Same as ViewCounterTotal.key
  day       DateTime            // Date truncated to day
  count     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([key, day])
}
```

## API Endpoints

### POST /api/views

Increment view count for content.

```typescript
// Request
{
  contentId: string
  contentType: 'resource' | 'course'
}

// Response
{
  success: true,
  count: 42
}
```

### GET /api/views

Get view count for content.

```typescript
// Query params
?contentId=xxx&contentType=resource

// Response
{
  count: 42
}
```

### POST /api/views/flush

Admin endpoint to flush KV counts to database.

```typescript
// Request (admin only)
{}

// Response
{
  success: true,
  flushed: 5  // Number of keys flushed
}
```

## useViews Hook

```typescript
import { useViews } from '@/hooks/useViews'

function ContentPage({ contentId }) {
  const { viewCount, incrementView, isLoading } = useViews({
    contentId,
    contentType: 'resource'
  })

  // Increment on mount (incrementView is stable via useCallback)
  useEffect(() => {
    incrementView()
  }, [incrementView])

  return <span>{viewCount} views</span>
}
```

## Key Format

```typescript
// Pattern: {namespace}:{entityId}
'resource:f538f5c5-1a72-4804-8eb1-3f05cea64874'
'course:a1b2c3d4-5678-90ab-cdef-1234567890ab'
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
  await prisma.viewCounterTotal.upsert({
    where: { key },
    create: { key, namespace, entityId, total: count },
    update: { total: { increment: count } }  // INCREMENT, not SET
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
  await prisma.viewCounterTotal.upsert({
    where: { key },
    create: { key, namespace, entityId, total: 1 },
    update: { total: { increment: 1 } }
  })
}
```

## Environment Variables

```env
# Vercel KV (optional, enables hybrid caching)
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=your-token
```

## Daily Analytics

Query daily view data:

```typescript
const dailyViews = await prisma.viewCounterDaily.findMany({
  where: {
    key: `resource:${resourceId}`,
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
