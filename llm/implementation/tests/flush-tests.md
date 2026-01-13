# flush.test.ts

**Location**: `src/app/api/views/tests/flush.test.ts`
**Tests**: 10

## Purpose

Tests the view counter flush logic for race condition safety.

## Background

View counts are stored in Vercel KV for fast increments, then periodically flushed to PostgreSQL. The flush must handle concurrent operations safely.

## Test Coverage

### GETDEL Atomicity

| Test | Scenario | Expected |
|------|----------|----------|
| Basic getdel | Key has value | Returns value, deletes key |
| Non-existent key | Key doesn't exist | Returns null |

### Race Condition Prevention

| Test | Scenario | Expected |
|------|----------|----------|
| Increment during flush | `incr` after `getdel` | Data not lost (creates new counter) |
| Multiple increments during flush | 3 `incr` after `getdel` | All increments preserved |

### INCREMENT vs SET Semantics

| Test | Scenario | Expected |
|------|----------|----------|
| Sequential flushes | 10 views, then 5 views | Total = 15 (not 5) |
| Concurrent flushes | Baseline 100, two flushes with 10 each | Total = 120 (100 + 10 + 10) |

The key insight: using `INCREMENT` instead of `SET` ensures concurrent flushes add to the total rather than overwriting each other.

### Zero Count Filtering

| Test | Scenario | Expected |
|------|----------|----------|
| Zero count key | Key with value 0 | Skipped |
| Null/deleted key | Key already flushed | Skipped |

### Dirty Set Cleanup

| Test | Scenario | Expected |
|------|----------|----------|
| Normal flush | Keys flushed | Removed from dirty set |
| Key re-added during flush | `sadd` between `getdel` and `srem` | Key removed (but data safe) |

## Race Condition Explanation

**Vulnerable Pattern (GET + DEL)**:
```
T1: GET views:123 → 100
T2: INCR views:123 → 101  (increment arrives)
T1: DEL views:123         (deletes 101, losing the increment)
```

**Safe Pattern (GETDEL + INCREMENT)**:
```
T1: GETDEL views:123 → 100 (atomic get and delete)
T2: INCR views:123 → 1     (creates NEW key since old was deleted)
T2: SADD dirty, views:123  (re-added to dirty set)
T1: DB.increment(100)      (adds 100 to DB)
-- Next flush picks up the 1 --
```

## Mock Implementation

```typescript
function createMockKV() {
  const store = new Map<string, number>()
  const sets = new Map<string, Set<string>>()

  return {
    async getdel<T>(key: string): Promise<T | null> {
      const val = store.get(key)
      store.delete(key)
      return val ?? null
    },
    async incr(key: string): Promise<number> {
      const current = store.get(key) ?? 0
      const next = current + 1
      store.set(key, next)
      return next
    },
    // ... sadd, smembers, srem
  }
}

function createMockDB() {
  const totals = new Map<string, { total: number }>()

  return {
    viewCounterTotal: {
      async upsert({ where, create, update }) {
        const existing = totals.get(where.key)
        if (existing && update.total.increment) {
          existing.total += update.total.increment
        } else {
          totals.set(where.key, { total: create.total })
        }
      }
    }
  }
}
```

## Related Files

- `src/app/api/views/flush/route.ts` - Implementation
- [view-analytics.md](../../context/view-analytics.md) - Architecture
