# Data Architecture

Database adapter pattern for pleb.school. Located in `src/lib/db-adapter.ts`.

## Overview

Clean data access abstraction using Prisma with optional Nostr event hydration. Server-side adapters handle database operations; client-side hooks fetch Nostr content.

## Core Adapters

### CourseAdapter

```typescript
import { CourseAdapter } from '@/lib/db-adapter'

// Find all courses
const courses = await CourseAdapter.findAll()

// Find with pagination
const { data, pagination } = await CourseAdapter.findAllPaginated({
  page: 1,
  pageSize: 20,
  userId: session?.user?.id // Include purchase info
})

// Find by ID
const course = await CourseAdapter.findById(id, userId)

// Find with Nostr event
const courseWithNote = await CourseAdapter.findByIdWithNote(id)

// Find by noteId (Nostr event ID)
const course = await CourseAdapter.findByNoteId(noteId)

// CRUD
const created = await CourseAdapter.create({ title, description, ... })
const updated = await CourseAdapter.update(id, { title: 'New Title' })
const deleted = await CourseAdapter.delete(id)
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

// Find by resource
const lessons = await LessonAdapter.findByResourceId(resourceId)

// CRUD
const lesson = await LessonAdapter.create({ courseId, resourceId, index, title })
const updated = await LessonAdapter.update(id, { index: 2 })
const deleted = await LessonAdapter.delete(id)
```

### PurchaseAdapter

```typescript
import { PurchaseAdapter } from '@/lib/db-adapter'

// Check user purchases
const coursePurchases = await PurchaseAdapter.findByUserAndCourse(userId, courseId)
const resourcePurchases = await PurchaseAdapter.findByUserAndResource(userId, resourceId)
```

## Nostr Event Hydration

Database stores metadata; Nostr stores content. Combine them for display:

```typescript
import { CourseAdapter, CourseWithNote } from '@/lib/db-adapter'
import { createCourseDisplay } from '@/data/types'

// Server: get course with Nostr event
const courseWithNote: CourseWithNote = await CourseAdapter.findByIdWithNote(id)

// Create display object merging DB + Nostr
if (courseWithNote.note) {
  const display = createCourseDisplay(courseWithNote, courseWithNote.note)
}
```

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
