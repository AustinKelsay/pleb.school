# Caching Patterns

Production-ready caching layer for pleb.school. Located in `src/lib/cache.ts`.

## Overview

In-memory caching only. Supports TTL, oldest-entry eviction when max size is hit (not true LRU), pattern invalidation, and tagged caching. There is no Redis/L2 cache wired up in the current codebase.

## Core Classes

### DataCache

Basic cache with TTL and oldest-entry eviction when `maxSize` is reached.

```typescript
import { globalCache } from '@/lib/cache'

// Get with automatic fetching
const course = await globalCache.get(
  `course:${id}`,
  () => CourseAdapter.findById(id),
  300000 // 5 minute TTL
)

// Manual set
globalCache.set('key', data, 60000)

// Get cached without fetching
const cached = globalCache.getCached<Course>('course:123')

// Invalidate
globalCache.invalidate('course:123')
globalCache.invalidatePattern('course:')
```

### TaggedCache

Extended cache with tag-based invalidation for complex scenarios.

```typescript
import { taggedCache } from '@/lib/cache'

// Set with tags
taggedCache.set('course:123', courseData, 300000, ['courses', 'user:456'])

// Invalidate all entries with tag
taggedCache.invalidateTag('user:456')
```

## Configuration

```typescript
const cache = new DataCache({
  maxSize: 1000,     // Max entries before oldest-entry eviction
  defaultTtl: 300000 // 5 minutes default
})
```

## Cache Statistics

```typescript
const stats = globalCache.getStats()
// Returns: { totalEntries, validEntries, expiredEntries, memoryUsage, hits, misses, hitRate }
```

## Cache Decorator

Method-level caching with automatic key generation.

```typescript
import { cached } from '@/lib/cache'

class CourseService {
  @cached(300000) // 5 min TTL
  async findById(id: string): Promise<Course> {
    return CourseAdapter.findById(id)
  }

  @cached(60000, (...args) => `search:${args[0]}`)
  async search(query: string): Promise<Course[]> {
    // ...
  }
}
```

## Usage with Adapters

The database adapters integrate with caching at the application layer:

```typescript
// In API route or server action
const course = await globalCache.get(
  `course:${courseId}`,
  async () => {
    const course = await CourseAdapter.findById(courseId)
    if (!course) throw new NotFoundError('Course')
    return course
  },
  300000
)
```

## Best Practices

1. Use consistent key prefixes (`course:`, `resource:`, `user:`)
2. Invalidate on mutations
3. Use pattern invalidation for bulk operations
4. Use tags for cross-entity relationships
5. Monitor hit rates in production
