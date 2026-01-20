# Drafts and Publishing

Complete workflow from draft creation through Nostr publishing. Draft services in `src/lib/draft-service.ts`, publishing in `src/lib/publish-service.ts`.

## Overview

```text
Draft (Database)
    ↓
Validate Content
    ↓
Create Nostr Event
    ↓
Sign Event (Server or NIP-07)
    ↓
Publish to Relays
    ↓
Create Database Record
    ↓
Clean Up Draft
```

## Draft Types

### Resource Draft

Single piece of content (video, document).

```typescript
interface Draft {
  id: string
  userId: string
  type: 'video' | 'document'
  title: string
  summary: string
  content: string          // Full markdown
  image?: string
  price?: number
  topics: string[]
  additionalLinks: AdditionalLink[]
  videoUrl?: string
  createdAt: string
  updatedAt: string
}
```

### Course Draft

Course with ordered lessons.

```typescript
interface CourseDraft {
  id: string
  userId: string
  title: string
  summary: string
  image?: string
  price?: number
  topics: string[]
  draftLessons: DraftLesson[]
  createdAt: string
  updatedAt: string
}

interface DraftLesson {
  id: string
  courseDraftId: string
  resourceId?: string    // Published resource
  draftId?: string       // Or draft resource
  index: number
}
```

## Draft Service

### Creating Drafts

```typescript
import { DraftService, CourseDraftService } from '@/lib/draft-service'

// Create resource draft
const draft = await DraftService.create({
  userId,
  type: 'video',
  title: 'My Video',
  summary: 'Description',
  content: '# Full content...',
  topics: ['bitcoin', 'beginner'],
  videoUrl: 'https://youtube.com/...'
})

// Create course draft
const courseDraft = await CourseDraftService.create({
  userId,
  title: 'My Course',
  summary: 'Course description',
  topics: ['bitcoin', 'course']
})
```

### Managing Lessons

```typescript
// Add lesson from published resource
await CourseDraftService.addLesson(courseDraftId, {
  resourceId: publishedResourceId,
  index: 0
})

// Add lesson from draft
await CourseDraftService.addLesson(courseDraftId, {
  draftId: draftResourceId,
  index: 1
})

// Reorder lessons
await CourseDraftService.reorderLessons(courseDraftId, [
  { id: lesson1Id, index: 0 },
  { id: lesson2Id, index: 1 }
])
```

### Validation

```typescript
// Validate before publishing
const errors = await DraftService.validate(draftId)
// Returns: string[] of validation errors

const courseErrors = await CourseDraftService.validate(courseDraftId)
// Checks: title, summary, lessons, lesson order
```

## Publishing Service

### Server-Side Publishing

For accounts with stored private keys (anonymous, OAuth-first):

```typescript
import { PublishService } from '@/lib/publish-service'

// Publish resource
const result = await PublishService.publishResource(
  draftId,
  userId,
  ['wss://relay.example.com', 'wss://nos.lol']
)
// result: { resource, event, publishedRelays }

// Publish course
const result = await PublishService.publishCourse(
  courseDraftId,
  userId,
  relays
)
// result: { course, lessons, event, publishedRelays, publishedLessonEvents }
```

### Client-Side Publishing (NIP-07)

For Nostr-first accounts without stored privkey:

```typescript
// 1. Fetch draft and create unsigned event for NIP-07 signing
//    Note: createUnsignedResourceEvent returns { kind, tags, content, pubkey, created_at }
//    without id or sig - those are added by window.nostr.signEvent
const draft = await fetchDraft(draftId)
const pubkey = await window.nostr.getPublicKey()
const unsignedEvent = createUnsignedResourceEvent(draft, pubkey)

// 2. Sign with NIP-07 extension (adds id and sig)
const signedEvent = await window.nostr.signEvent(unsignedEvent)

// 3. Submit signed event to API
const result = await publishDraft({
  type: 'resource',
  draftId,
  signedEvent
})
```

### Publishing Flow

```typescript
// Internal flow for server-side publishing:

1. Fetch draft with user info
2. Verify ownership (draft.userId === userId)
3. Check for duplicate lesson usage
4. Create Nostr event:
   - Kind 30023 for free content
   - Kind 30402 for paid content
   - Kind 30004 for courses
5. Sign with decrypted privkey
6. Publish to relays
7. Create database record in transaction:
   - Resource/Course with noteId
   - Lessons linked to resources
8. Delete draft (or mark published)
9. Return result
```

## Nostr Event Creation

### Resource Event

```typescript
// src/lib/nostr-events.ts
import { createResourceEvent } from '@/lib/nostr-events'

const event = createResourceEvent(draft, signingPrivkey)
// Returns signed NostrEvent (kind 30023 or 30402)
```

### Course Event

```typescript
import { createCourseEvent } from '@/lib/nostr-events'

const event = createCourseEvent(courseDraft, lessonReferences, signingPrivkey)
// Returns signed NostrEvent (kind 30004)
// lessonReferences: Array<{ resourceId, pubkey }> for each lesson
// Generates 'a' tags: "<kind>:<pubkey>:<d-tag>" where kind is 30023 (free) or 30402 (paid)
```

### Event Structure

```typescript
// Resource (NIP-23/99)
{
  kind: draft.price > 0 ? 30402 : 30023,
  tags: [
    ['d', draft.id],
    ['title', draft.title],
    ['summary', draft.summary],
    // Only include image tag when present
    ...(draft.image ? [['image', draft.image]] : []),
    // NIP-23/99 requires ONE ['t', topic] tag PER topic
    ...(draft.topics || []).map(topic => ['t', topic]),
    // Only include price tag for paid content
    ...(draft.price > 0 ? [['price', String(draft.price), 'sats']] : []),
    // ONE ['r', url] tag PER additional link
    ...(draft.additionalLinks || []).map(link => ['r', link.url])
  ],
  content: draft.content,
  pubkey: userPubkey,
  created_at: Math.floor(Date.now() / 1000)
}

// Course (NIP-51)
{
  kind: 30004,
  tags: [
    ['d', courseDraft.id],
    ['name', courseDraft.title],
    ['about', courseDraft.summary],
    // Only include image tag when present
    ...(courseDraft.image ? [['image', courseDraft.image]] : []),
    // ONE ['t', topic] tag PER topic
    ...(courseDraft.topics || []).map(topic => ['t', topic]),
    // Only include price tag for paid content
    ...(courseDraft.price > 0 ? [['price', String(courseDraft.price), 'sats']] : []),
    // Lesson references (kind 30023 for free, 30402 for paid)
    ['a', '30023:pubkey:free-lesson-dtag'],
    ['a', '30402:pubkey:paid-lesson-dtag']
  ],
  content: '',
  pubkey: userPubkey,
  created_at: Math.floor(Date.now() / 1000)
}
```

## Republishing

Update existing published content:

```typescript
import { RepublishService } from '@/lib/republish-service'

// Republish resource
await RepublishService.republishResource(resourceId, userId, relays)

// Republish course
await RepublishService.republishCourse(courseId, userId, relays)
```

Republishing:
1. Fetches current database record
2. Fetches original Nostr event
3. Creates updated event with same `d` tag
4. Publishes to relays (replaces old event)
5. Updates noteId if changed

## API Endpoints

### Resource Drafts

```text
GET    /api/drafts/resources         - List user's drafts
POST   /api/drafts/resources         - Create draft
GET    /api/drafts/resources/[id]    - Get draft
PUT    /api/drafts/resources/[id]    - Update draft
DELETE /api/drafts/resources/[id]    - Delete draft
POST   /api/drafts/resources/[id]/validate - Validate
POST   /api/drafts/resources/[id]/publish  - Publish
```

### Course Drafts

```text
GET    /api/drafts/courses           - List course drafts
POST   /api/drafts/courses           - Create course draft
GET    /api/drafts/courses/[id]      - Get with lessons
PUT    /api/drafts/courses/[id]      - Update
DELETE /api/drafts/courses/[id]      - Delete
POST   /api/drafts/courses/[id]/validate - Validate
POST   /api/drafts/courses/[id]/publish  - Publish
```

### Lesson Drafts

```text
POST   /api/drafts/lessons           - Add lesson to course
DELETE /api/drafts/lessons/[id]      - Remove lesson
POST   /api/drafts/lessons/reorder   - Reorder lessons
```

## Client Integration

### usePublishDraft Hook

```typescript
import { usePublishDraft } from '@/hooks/usePublishDraft'

function PublishButton({ draft }) {
  const { publishDraft, isPublishing, error } = usePublishDraft()
  const { data: session } = useSession()

  const handlePublish = async () => {
    // Check if NIP-07 signing required
    // Treat missing session/user as no privkey (requires NIP-07)
    const needsNip07 = !session?.user?.privkey

    let signedEvent
    if (needsNip07) {
      // Get pubkey from extension
      const pubkey = await window.nostr.getPublicKey()
      // Create unsigned event (includes pubkey, excludes id/sig)
      const unsignedEvent = createUnsignedResourceEvent(draft, pubkey)
      // Sign with extension
      signedEvent = await window.nostr.signEvent(unsignedEvent)
    }

    await publishDraft({
      type: 'resource',
      draftId: draft.id,
      signedEvent  // Only if NIP-07
    })
  }

  return (
    <button onClick={handlePublish} disabled={isPublishing}>
      {isPublishing ? 'Publishing...' : 'Publish'}
    </button>
  )
}
```

## Error Handling

```typescript
class PublishError extends Error {
  code: string
  details?: unknown
}

// Common error codes:
'DRAFT_NOT_FOUND'         // Draft doesn't exist
'ACCESS_DENIED'           // Not owner
'PRIVKEY_NOT_AVAILABLE'   // NIP-07 required
'DUPLICATE_DRAFT_LESSONS' // Draft used multiple times
'INVALID_EVENT'           // Event creation failed
'RELAY_PUBLISH_FAILED'    // All relays failed
'DATABASE_ERROR'          // Transaction failed
```

## Best Practices

1. **Validate before publishing** - Always run validation
2. **Check signing mode** - Detect NIP-07 vs server-side
3. **Handle relay failures** - Some relays may fail
4. **Atomic operations** - Database operations are transactional
5. **Clean up drafts** - Delete after successful publish

## Related Documentation

- [nostr-events.md](./nostr-events.md) - Event structures
- [database-schema.md](./database-schema.md) - Draft models
- [hooks-reference.md](./hooks-reference.md) - usePublishDraft
- [authentication-system.md](./authentication-system.md) - Signing modes
