# Nostr Events

Nostr event structures, building, and parsing for pleb.school content. The platform uses Nostr for content storage with the database storing only metadata.

## NIPs Used

| NIP | Kind | Purpose |
|-----|------|---------|
| NIP-01 | * | Basic event structure and relay protocol |
| NIP-07 | - | Browser extension signing |
| NIP-19 | - | Bech32 encoding (npub, naddr) |
| NIP-23 | 30023 | Long-form content (free resources) |
| NIP-51 | 30004 | Lists (courses) |
| NIP-57 | 9734/9735 | Zaps (Lightning payments) |
| NIP-98 | 27235 | HTTP authentication |
| NIP-99 | 30402 | Classified listings (paid resources) |

## Event Structures

### Base Event (NIP-01)

All Nostr events share this structure:

```typescript
interface NostrEvent {
  id: string           // 32-bytes hex SHA256 of serialized event
  pubkey: string       // 32-bytes hex public key
  created_at: number   // Unix timestamp (seconds)
  kind: number         // Event type
  tags: string[][]     // Metadata tags
  content: string      // Event content
  sig: string          // 64-bytes hex Schnorr signature
}
```

### Course Event (NIP-51 kind 30004)

Courses are stored as NIP-51 curation sets with lesson references.

```typescript
// Example course event
{
  "kind": 30004,
  "pubkey": "f33c8a96...",
  "content": "",  // Empty for courses
  "tags": [
    ["d", "f538f5c5-1a72-4804-8eb1-3f05cea64874"],  // Unique identifier
    ["name", "pleb.school Starter Course"],
    ["about", "Course description..."],
    ["image", "https://..."],
    ["t", "beginner"],
    ["t", "frontend"],
    ["t", "course"],
    ["published_at", "1740860353"],
    // Lesson references (ordered) - kind matches lesson's free/paid status
    ["a", "30023:f33c8a96...:lesson-1-id"],  // Free lesson (NIP-23)
    ["a", "30402:f33c8a96...:lesson-2-id"],  // Paid lesson (NIP-99)
    // ... more lessons
  ]
}
```

**Tag Reference:**

| Tag | Purpose |
|-----|---------|
| `d` | Unique identifier (UUID) |
| `name` | Course title |
| `about` | Course description |
| `image` | Cover image URL |
| `t` | Topic tags |
| `published_at` | Unix timestamp (string) |
| `a` | Lesson references (addressable events) |
| `price` | Price in sats (optional, DB is authoritative) |
| `p` | Instructor pubkey (optional) |

### Free Resource Event (NIP-23 kind 30023)

Long-form content for free resources.

```typescript
// Example video lesson
{
  "kind": 30023,
  "pubkey": "f33c8a96...",
  "content": "<video embed>\\n\\n# Lesson Title\\n\\nMarkdown content...",
  "tags": [
    ["d", "f93827ed-68ad-4b5e-af33-f7424b37f0d6"],
    ["title", "Setting up your Code Editor"],
    ["summary", "Lesson summary..."],
    ["image", "https://..."],
    ["video", "https://example.com/video.mp4"],  // Video URL for video-type content
    ["t", "video"],
    ["t", "beginner"],
    ["published_at", "1740871522"],
    ["r", "https://..."]  // Additional links
  ]
}
```

**Tag Reference:**

| Tag | Purpose |
|-----|---------|
| `d` | Unique identifier |
| `title` | Content title |
| `summary` | Short description |
| `image` | Cover image URL |
| `t` | Topic tags (includes type: video, document) |
| `published_at` | Unix timestamp (string) |
| `r` | Reference URLs (additional links) |
| `video` | Video URL (for video type) |

### Paid Resource Event (NIP-99 kind 30402)

Classified listings for paid content.

```typescript
// Example paid resource
{
  "kind": 30402,
  "pubkey": "f33c8a96...",
  "content": "Markdown content...",
  "tags": [
    ["d", "premium-course-id"],
    ["title", "Premium Workshop"],
    ["summary", "Workshop description..."],
    ["image", "https://..."],
    ["price", "2100", "sats"],  // Price hint (DB is authoritative)
    ["t", "workshop"],
    ["published_at", "1740871522"]
  ]
}
```

**Additional Tags for NIP-99:**

| Tag | Purpose |
|-----|---------|
| `price` | Price hint `["price", "amount", "currency"]` |
| `location` | Physical location (if applicable) |
| `status` | "active" or "sold" |

## Event Parsing

### parseCourseEvent

Parses NIP-51 course events to extract metadata and lesson references.

```typescript
// src/data/types.ts
import { parseCourseEvent } from '@/data/types'

const parsed = parseCourseEvent(event)
// Returns:
{
  title: string
  description: string
  image?: string
  publishedAt?: number
  price?: number
  currency?: string
  topics: string[]
  category?: string
  instructor?: string
  instructorPubkey?: string
  isPremium: boolean
  dTag: string
  additionalLinks: AdditionalLink[]
  lessonIds: string[]  // "a" tag values
}
```

### parseEvent

Parses NIP-23/99 resource events.

```typescript
// src/data/types.ts
import { parseEvent } from '@/data/types'

const parsed = parseEvent(event)
// Returns:
{
  title: string
  summary: string
  content: string
  image?: string
  publishedAt?: number
  price?: number
  currency?: string
  type: 'video' | 'document'
  topics: string[]
  category?: string
  author?: string
  authorPubkey?: string
  isPremium: boolean
  dTag: string
  videoUrl?: string
  additionalLinks: AdditionalLink[]
}
```

### Type Detection

Type detection is handled internally by `parseEvent()` (for resources) and `parseCourseEvent()` (for courses) in `src/data/types.ts`. **Always use these parser helpers** rather than manually inspecting tags.

Internally, the parser checks for `['t', 'video']` topic tags or `['video', url]` tags to determine if content is video type; otherwise defaults to `'document'`.

## Event Building

### createCourseEvent

Creates NIP-51 course events for publishing.

```typescript
// src/lib/nostr-events.ts
import { createCourseEvent } from '@/lib/nostr-events'

const courseDraft = {
  id: 'course-uuid',
  userId: 'user-id',
  title: 'Course Title',
  summary: 'Course description',
  image: 'https://...',
  topics: ['bitcoin', 'lightning'],
  price: 2100
}

const lessonReferences = [
  { resourceId: 'lesson-1-id', pubkey: 'author-pubkey', price: 0 },
  { resourceId: 'lesson-2-id', pubkey: 'author-pubkey', price: 2100 }
]

const event = createCourseEvent(courseDraft, lessonReferences, privateKey)
```

### createResourceEvent

Creates NIP-23 (free) or NIP-99 (paid) resource events.

```typescript
// src/lib/nostr-events.ts
import { createResourceEvent } from '@/lib/nostr-events'

const resourceDraft = {
  id: 'resource-uuid',
  userId: 'user-id',
  type: 'video',
  title: 'Resource Title',
  summary: 'Short summary',
  content: 'Full markdown content',
  image: 'https://...',
  topics: ['video', 'beginner'],
  price: 0,  // 0 = NIP-23 (free), >0 = NIP-99 (paid)
  videoUrl: 'https://youtube.com/...',
  additionalLinks: [{ label: 'Slides', url: 'https://...' }]
}

const event = createResourceEvent(resourceDraft, privateKey)
```

### Event Signing

Events can be signed server-side or via NIP-07:

```typescript
// Server-side (has privkey)
import { signEvent } from 'snstr'
const signedEvent = await signEvent(event, privkey)

// Client-side (NIP-07)
const signedEvent = await window.nostr.signEvent(event)
```

## Display Interfaces

### Creating Display Objects

Merge database metadata with parsed Nostr events:

```typescript
// src/data/types.ts
import { createCourseDisplay, createResourceDisplay } from '@/data/types'

// Course display
const courseDisplay = createCourseDisplay(dbCourse, parsedEvent)
// Returns CourseDisplay with merged data

// Resource display
const resourceDisplay = createResourceDisplay(dbResource, parsedEvent)
// Returns ResourceDisplay with merged data
```

### CourseDisplay

```typescript
interface CourseDisplay {
  // From database
  id: string
  userId: string
  price: number
  noteId?: string
  submissionRequired: boolean
  createdAt: string
  updatedAt: string
  purchased: boolean

  // From Nostr event
  title: string
  description: string
  image?: string
  topics: string[]
  instructor?: string
  lessonCount: number

  // Computed
  type: 'course'
  isPremium: boolean
}
```

### ResourceDisplay

```typescript
interface ResourceDisplay {
  // From database
  id: string
  userId: string
  price: number
  noteId?: string
  videoId?: string
  videoUrl?: string
  createdAt: string
  updatedAt: string
  purchased: boolean

  // From Nostr event
  title: string
  summary: string
  content: string
  image?: string
  topics: string[]
  author?: string

  // Computed
  type: 'video' | 'document'
  isPremium: boolean
}
```

## Relay Configuration

Relays are configured in `config/nostr.json`:

```typescript
// src/lib/nostr-relays.ts (client)
// src/lib/nostr-relays.server.ts (server)
import { getRelays } from '@/lib/nostr-relays'

const relays = getRelays('content')  // or 'profile', 'default', 'zapThreads'
```

Current runtime behavior:
- `getRelays(...)` still provides the base relay sets from `config/nostr.json`.
- `src/lib/note-reference-resolution.ts` can merge embedded relay hints from encoded note references with the default relay set instead of replacing it.
- `NostrFetchService.fetchEventsByDTags()` retries unresolved `#d` lookups relay-by-relay after the initial combined query.
- Legacy fallback is not limited to raw 64-character event ids; note references such as `note`, `nevent`, and `naddr` are supported when resolving content notes.

## Content Hydration Flow

1. **Server**: Database adapters load canonical course/resource rows.
2. **Server**: `src/lib/content-catalog.server.ts` resolves notes through `resolveCatalogEventsByIdentity(...)`, trying `#d` first and `noteId` fallback second.
3. **Server**: `applyResolvedNoteToContentItem(...)` merges parsed note fields into the `ContentItem`.
4. **Render**: If note lookup misses, the item still renders from DB fallback data with `noteResolved: false`.
5. **Client repair**: `useCatalogNoteRepair(...)` retries only unresolved catalog items in the browser, first by `#d`, then by note reference.
6. **Resource readers**: `src/lib/resource-page-data.server.ts` returns either an initial event or `ResourceContentInitialMeta.resourceNoteId`, keeping UUID-backed resources recoverable even when the first server fetch misses.

```typescript
// Server catalog path:
const { eventsByEntityId } = await resolveCatalogEventsByIdentity(entities, [30004, 30023, 30402, 30403])
const hydratedItems = items.map((item) => {
  const note = eventsByEntityId.get(item.id)
  return note ? applyResolvedNoteToContentItem(item, note) : { ...item, noteResolved: false }
})

// Client repair path:
const repairedItems = useCatalogNoteRepair(hydratedItems)
// Internally, unresolved items retry #d first, then fetchEventsByReferences([item.noteId]).
```

Legacy free-video note:
- `kind 30023` notes may still represent videos. Video classification is preserved from DB/resource context and parsed note fields, so older notes are not downgraded to documents only because they lack one specific tag form.

## Related Documentation

- [database-schema.md](./database-schema.md) - Database models
- [data-architecture.md](./data-architecture.md) - Adapter pattern
- [type-definitions.md](./type-definitions.md) - TypeScript interfaces
- [snstr/](./snstr/) - Nostr library documentation
