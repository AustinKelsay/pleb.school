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

**Improved Pattern (GETDEL + INCREMENT)**:
```
T1: GETDEL views:123 → 100 (atomic get and delete)
T2: INCR views:123 → 1     (creates NEW key since old was deleted)
T2: SADD dirty, views:123  (re-added to dirty set)
T1: DB.increment(100)      (adds 100 to DB)
T1: SREM dirty, views:123  (removes key, even though T2 re-added it)
-- Next flush won't see the 1 until another INCR triggers SADD --
```

**Remaining Race**: The dirty set has a timing window between `GETDEL` and `SREM`. If `INCR`+`SADD` occur in this window, `SREM` still removes the key (sets don't track when members were added). The counter value (1) remains in KV but isn't in the dirty set until the next `INCR` re-adds it. Data isn't lost, but can be delayed indefinitely if no new views arrive.

### Mitigation Strategies

Several approaches can mitigate the race condition between `GETDEL` and `SREM`:

#### 1. Post-SREM Check

After performing `SREM` to remove a key from the dirty set, perform a KV existence check of the counter (the key affected by `GETDEL`/`INCR`/`SADD`). If the counter still exists in KV, re-add it to the dirty set via `SADD`.

**Trade-offs**:
- **Extra cost**: Adds one `EXISTS` or `GET` operation per flushed key, increasing Redis round-trips
- **Effectiveness**: Reduces the race window but doesn't eliminate it (concurrent `INCR`+`SADD` can still occur after the check)
- **Complexity**: Low — straightforward conditional logic

#### 2. Background Sweep

Implement a periodic background job that scans KV keys (or key prefixes) to find counters present in KV but missing from the dirty set. Re-add any orphaned counters to the dirty set via `SADD`.

**Trade-offs**:
- **Scan overhead**: Requires scanning all view counter keys periodically, which can be expensive at scale
- **Latency**: Delayed detection means counters may remain unflushed until the next sweep interval
- **Complexity**: Medium — requires job scheduling and key pattern matching logic

#### 3. Sorted-Set with Timestamps

Replace the dirty set (SET) with a sorted set (ZSET) via `ZADD` with `score=timestamp`. During cleanup, use `ZREMRANGEBYSCORE` or timestamp-based queries to avoid blind removals. Only remove keys older than a threshold, preserving recently added entries.

**Trade-offs**:
- **Extra cost**: `ZADD` operations are slightly more expensive than `SADD`, and timestamp management adds overhead
- **Effectiveness**: High — timestamps enable safe, targeted removals that respect concurrent additions
- **Complexity**: Medium — requires timestamp tracking and score-based cleanup logic

#### 4. Atomic Lua Check-and-Remove

Use an atomic Redis Lua script that checks the KV value or membership before removing the key from the dirty set. The script atomically verifies that no concurrent `INCR`+`SADD` re-added the key, only removing when safe.

**Trade-offs**:
- **Complexity**: High — requires Lua script development, testing, and maintenance
- **Effectiveness**: Highest — atomic operations eliminate the race condition entirely
- **Performance**: Lua scripts execute atomically but may block Redis briefly; generally efficient for this use case

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
