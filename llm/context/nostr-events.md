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
    // Lesson references (ordered)
    ["a", "30023:f33c8a96...:lesson-1-id"],
    ["a", "30023:f33c8a96...:lesson-2-id"],
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
    ["t", "video"],
    ["t", "document"],
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

The parser determines content type from tags:

```typescript
// Video detection - check for ['t', 'video'] tag
if (tags.some(t => t[0] === 't' && t[1] === 'video')) type = 'video'
// Or if videoUrl tag exists
else if (tags.find(t => t[0] === 'video')) type = 'video'
// Default to document
else type = 'document'
```

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
  { resourceId: 'lesson-1-id', pubkey: 'author-pubkey' },
  { resourceId: 'lesson-2-id', pubkey: 'author-pubkey' }
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

## Content Hydration Flow

1. **Server**: Fetch content metadata from database
2. **Client**: Fetch Nostr event via `useNostr` hook
3. **Parse**: Extract fields with `parseCourseEvent` or `parseEvent`
4. **Merge**: Create display object with `createCourseDisplay` or `createResourceDisplay`
5. **Render**: Use display object in UI components

```typescript
// Conceptual flow (pseudocode spanning server/client boundary):
// 1. Server: dbCourse = await CourseAdapter.findById(id)
// 2. Client: const { fetchEvent } = useNostr()  // hook at component top level
//            note = await fetchEvent(dbCourse.noteId)
// 3. Parse:  parsed = parseCourseEvent(note)
// 4. Merge:  display = createCourseDisplay(dbCourse, parsed)
```

## Related Documentation

- [database-schema.md](./database-schema.md) - Database models
- [data-architecture.md](./data-architecture.md) - Adapter pattern
- [type-definitions.md](./type-definitions.md) - TypeScript interfaces
- [snstr/](./snstr/) - Nostr library documentation
