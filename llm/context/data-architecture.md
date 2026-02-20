# Data Architecture

Database adapter pattern for pleb.school. Located in `src/lib/db-adapter.ts`.

## Overview

Clean data access abstraction using Prisma with optional Nostr event hydration. Server-side adapters handle database operations; client-side fetches can hydrate Nostr events (note fetch is client-only in `findByIdWithNote`).

## Prisma Runtime (v7)

Prisma v7 uses the driver adapter pattern. The generated client lives in `src/generated/prisma` and is imported via `@/generated/prisma`.

```typescript
import { PrismaClient, type Prisma } from "@/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
```

Notes:
- `src/lib/prisma.ts` caches both `PrismaClient` and `Pool` on `globalThis` in development to avoid connection exhaustion during hot reloads.
- Adapter and pool are also used in scripts (e.g. `prisma/seed.ts`), with `pool.end()` on shutdown.
- Prisma type imports in adapters should come from `@/generated/prisma`.

## Core Adapters

### CourseAdapter

```typescript
import { CourseAdapter } from '@/lib/db-adapter'

// Find all courses
const courses = await CourseAdapter.findAll()

// Find with pagination
const { data, pagination } = await CourseAdapter.findAllPaginated({
  page: 1,
  pageSize: 20
})

// Find by ID
const course = await CourseAdapter.findById(id, userId)

// Find with Nostr event
const courseWithNote = await CourseAdapter.findByIdWithNote(id)

// Find by noteId (Nostr event ID)
const course = await CourseAdapter.findByNoteId(noteId)

// CRUD (Course has no title/description columns; those live in Nostr events)
const created = await CourseAdapter.create({
  userId,
  price: 0,
  noteId: null,
  submissionRequired: false
})
const updated = await CourseAdapter.update(id, { price: 2100 })
const deleted = await CourseAdapter.delete(id)

// Course deletion checks for purchases AND lessons before allowing delete
// Check purchases first - cannot delete a course that has been purchased
const purchaseCount = await PurchaseAdapter.countByCourse(courseId)
if (purchaseCount > 0) {
  // Returns 409 Conflict - cannot delete purchased course
}

// Check lessons second - cannot delete a course with associated lessons
const lessonCount = await LessonAdapter.countByCourse(courseId)
if (lessonCount > 0) {
  // Returns 409 Conflict with count of lessons
}

// Only then proceed with deletion
const deleted = await CourseAdapter.delete(courseId)
```

### ResourceAdapter

```typescript
import { ResourceAdapter } from '@/lib/db-adapter'

// Find all (excludes lesson resources by default)
const resources = await ResourceAdapter.findAll()

// Include lesson resources
const allResources = await ResourceAdapter.findAll({ includeLessonResources: true })

// Find with pagination and purchase info
const { data, pagination } = await ResourceAdapter.findAllPaginated({
  page: 1,
  pageSize: 20,
  userId: session?.user?.id,
  includeLessonResources: false
})

// Find by various identifiers
const resource = await ResourceAdapter.findById(id, userId)
const resource = await ResourceAdapter.findByNoteId(noteId)
const resource = await ResourceAdapter.findByVideoId(videoId)

// Find with Nostr event (userId is optional)
// Signature: findByIdWithNote(id: string, userId?: string)
// Pass userId to include purchase information for that user
const resourceWithNote = await ResourceAdapter.findByIdWithNote(id)
// Or with userId to include purchase info:
const resourceWithNoteAndPurchase = await ResourceAdapter.findByIdWithNote(id, userId)

// Filter by price
const freeResources = await ResourceAdapter.findFree()
const paidResources = await ResourceAdapter.findPaid()

// Check if resource is used as lesson
const isLesson = await ResourceAdapter.isLesson(resourceId)
```

### LessonAdapter

```typescript
import { LessonAdapter } from '@/lib/db-adapter'

// Find by course
const lessons = await LessonAdapter.findByCourseId(courseId)

// Find by course with resources eagerly loaded (avoids N+1 queries)
// Returns Lesson objects with optional `resource` field populated
const lessonsWithResources = await LessonAdapter.findByCourseIdWithResources(courseId)

// Count lessons (used for course deletion check)
const count = await LessonAdapter.countByCourse(courseId)

// Find by resource
const lessons = await LessonAdapter.findByResourceId(resourceId)

// CRUD
const lesson = await LessonAdapter.create({ courseId, resourceId, draftId, index })
const updated = await LessonAdapter.update(id, { index: 2 })
const deleted = await LessonAdapter.delete(id)
```

### PurchaseAdapter

```typescript
import { PurchaseAdapter } from '@/lib/db-adapter'

// Check user purchases
const coursePurchases = await PurchaseAdapter.findByUserAndCourse(userId, courseId)
const resourcePurchases = await PurchaseAdapter.findByUserAndResource(userId, resourceId)
const purchaseCount = await PurchaseAdapter.countByCourse(courseId)
```

### AuditLogAdapter

Responsible for persisting audit logs (security-sensitive operations). Use via `auditLog()` in `@/lib/audit-logger` — do not call the adapter directly from API routes; use the audit logger which handles normalization and error semantics (audit logging must never throw).

```typescript
import { AuditLogAdapter } from '@/lib/db-adapter'

// Persist audit event (typically via auditLog() instead)
await AuditLogAdapter.create({
  userId,
  action: 'purchase.claim',
  details: { resourceId, amountPaid },
  ip: request?.headers.get('x-forwarded-for'),
  userAgent: request?.headers.get('user-agent'),
})
```

## Nostr Event Hydration

Database stores metadata (price, userId, timestamps); Nostr stores content (title, description, image). The `findByIdWithNote` methods fetch Nostr events **client-side only** - on the server they return `note: null`.

### Server-Only (DB metadata without Nostr content)

```typescript
import { CourseAdapter } from '@/lib/db-adapter'

// Server component or API route - returns DB fields only
const course = await CourseAdapter.findById(id, userId)
// course.price, course.userId, course.noteId available
// course has NO title/description (those are in Nostr)
```

### Client-Side Hydration (DB + Nostr merged)

```typescript
'use client'
import { CourseAdapter, CourseWithNote } from '@/lib/db-adapter'
import { createCourseDisplay, parseCourseEvent } from '@/data/types'

// Client component - fetches from Nostr relays
const courseWithNote: CourseWithNote = await CourseAdapter.findByIdWithNote(id)

// courseWithNote.note is populated on client, null on server
if (courseWithNote.note) {
  const parsed = parseCourseEvent(courseWithNote.note)  // Extract title, description, image
  const display = createCourseDisplay(courseWithNote, parsed)  // Merge DB + Nostr
  // display.title, display.description, display.price all available
}
```

### Resource Hydration Pattern

Resources follow the same pattern with `parseEvent` + `createResourceDisplay`:

```typescript
'use client'
import { ResourceAdapter } from '@/lib/db-adapter'
import { createResourceDisplay, parseEvent } from '@/data/types'

// userId is optional - pass it to include purchase information
const resourceWithNote = await ResourceAdapter.findByIdWithNote(id, userId)

if (resourceWithNote.note) {
  const parsed = parseEvent(resourceWithNote.note)
  const display = createResourceDisplay(resourceWithNote, parsed)
}
```

### Server-Side Hydration (requires caching)

For SSR with Nostr content, you'd need to:
1. Cache Nostr events in the database or Redis
2. Fetch from cache on server, fall back to client fetch
3. Or use a server-side Nostr client with relay connections

Currently, the app uses client-side hydration for simplicity.

## Type Transformations

Adapters handle Prisma-to-TypeScript transformations:

```typescript
// Prisma returns Date objects, adapters convert to ISO strings
function transformCourse(course: PrismaCourse): Course {
  return {
    ...course,
    noteId: course.noteId ?? undefined,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    user: transformUser(course.user),
  }
}
```

## Pagination Response

All paginated methods return consistent structure:

```typescript
interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}
```

## Best Practices

1. Always use adapters, never access Prisma directly in components
2. Pass `userId` to include purchase information when needed
3. Use `findByIdWithNote` only when Nostr content is required
4. Handle `null` returns for missing records
5. Use pagination for list views
