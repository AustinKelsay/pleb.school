# Type Definitions

TypeScript interfaces and type transformations for pleb.school. Core types are defined in `src/data/types.ts`.

## Content Types

### Database Types (from Prisma)

These types mirror the database schema with ISO string dates.

Prisma types and namespaces are imported from the generated client:

```typescript
import type { Prisma } from "@/generated/prisma"
```

```typescript
interface Course {
  id: string
  userId: string
  price: number
  noteId?: string
  submissionRequired: boolean
  createdAt: string  // ISO string
  updatedAt: string
  user?: User
}

interface Resource {
  id: string
  userId: string
  price: number
  noteId?: string
  videoId?: string
  videoUrl?: string
  createdAt: string
  updatedAt: string
  user?: User
}

interface Lesson {
  id: string
  courseId?: string
  resourceId?: string
  draftId?: string
  index: number
  createdAt: string
  updatedAt: string
  resource?: Resource
  draft?: Draft
}
```

### With-Note Types

Database records hydrated with Nostr events.

```typescript
interface CourseWithNote extends Course {
  note: NostrCourseListEvent | null
}

interface ResourceWithNote extends Resource {
  note: NostrEvent | null
}
```

### Parsed Event Types

Extracted fields from Nostr events.

```typescript
interface ParsedCourseEvent {
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
  lessonIds: string[]
}

interface ParsedResourceEvent {
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

### Display Types

Merged database + Nostr for UI rendering.

```typescript
interface CourseDisplay {
  // Database fields
  id: string
  userId: string
  price: number
  noteId?: string
  submissionRequired: boolean
  createdAt: string
  updatedAt: string
  purchased: boolean

  // Nostr fields
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

interface ResourceDisplay {
  // Database fields
  id: string
  userId: string
  price: number
  noteId?: string
  videoId?: string
  videoUrl?: string
  createdAt: string
  updatedAt: string
  purchased: boolean

  // Nostr fields
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

## User Types

### User

```typescript
interface User {
  id: string
  pubkey?: string
  email?: string
  username?: string
  displayName?: string
  avatar?: string
  banner?: string
  nip05?: string
  lud16?: string
  primaryProvider?: string
  profileSource?: string
  createdAt: string
  updatedAt: string
}
```

### Session User (NextAuth extension)

```typescript
// src/types/next-auth.d.ts
interface SessionUser {
  id: string
  pubkey?: string
  privkey?: string  // Encrypted, for server-side signing
  email?: string
  name?: string
  image?: string
  provider: string
  providerAccountId: string
  isAdmin: boolean
  primaryProvider?: string
  profileSource?: string
}
```

### Profile Types

```typescript
interface AggregatedProfile {
  name?: { value: string; source: string }
  email?: { value: string; source: string }
  username?: { value: string; source: string }
  image?: { value: string; source: string }
  banner?: { value: string; source: string }
  about?: { value: string; source: string }
  website?: { value: string; source: string }
  github?: { value: string; source: string }
  twitter?: { value: string; source: string }
  location?: { value: string; source: string }
  company?: { value: string; source: string }
  pubkey?: { value: string; source: string }
  nip05?: { value: string; source: string }
  lud16?: { value: string; source: string }
  linkedAccounts: LinkedAccountData[]
  primaryProvider: string | null
  profileSource: string | null
  totalLinkedAccounts: number
}

interface LinkedAccountData {
  provider: string
  providerAccountId: string
  data: Record<string, any>
  isConnected: boolean
  isPrimary: boolean
  alternatives?: Record<string, { value: string; source: string }>
}
```

## Purchase Types

```typescript
interface Purchase {
  id: string
  userId: string
  courseId?: string
  resourceId?: string
  amountPaid: number
  priceAtPurchase?: number
  paymentType: 'zap' | 'manual' | 'comped' | 'refund'
  zapReceiptId?: string
  invoice?: string
  zapReceiptJson?: NostrEvent | NostrEvent[]
  zapRequestJson?: NostrEvent
  createdAt: string
  updatedAt: string
}

// src/types/purchases.ts
interface PurchaseClaimRequest {
  resourceId?: string
  courseId?: string
  amountPaid: number
  paymentType?: 'zap' | 'manual' | 'comped' | 'refund'
  zapReceiptId?: string
  zapReceiptIds?: string[]
  zapReceiptJson?: NostrEvent | NostrEvent[]
  zapRequestJson?: NostrEvent
  invoice?: string
  nostrPrice?: number
  zapTotalSats?: number
  relayHints?: string[]
  allowPastZaps?: boolean  // When true, allows claiming older zap receipts
}

interface PurchaseClaimResponse {
  success: true
  data: {
    purchase: Purchase
    created: boolean
    alreadyOwned: boolean
    amountCredited: number
    priceSats: number
    zapTotalSats?: number
  }
}
```

## Draft Types

```typescript
interface Draft {
  id: string
  userId: string
  type: 'video' | 'document'
  title: string
  summary: string
  content: string
  image?: string
  price?: number
  topics: string[]
  additionalLinks: AdditionalLink[]
  videoUrl?: string
  createdAt: string
  updatedAt: string
}

interface CourseDraft {
  id: string
  userId: string
  title: string
  summary: string
  image?: string
  price?: number
  topics: string[]
  createdAt: string
  updatedAt: string
  draftLessons?: DraftLesson[]
}

interface DraftLesson {
  id: string
  courseDraftId: string
  resourceId?: string
  draftId?: string
  index: number
  resource?: Resource
  draft?: Draft
}
```

## Nostr Event Types

```typescript
interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

// NIP-51 course list
interface NostrCourseListEvent extends NostrEvent {
  kind: 30004
}

// NIP-23 long-form content
interface NostrFreeContentEvent extends NostrEvent {
  kind: 30023
}

// NIP-99 paid content
interface NostrPaidContentEvent extends NostrEvent {
  kind: 30402
}

// NIP-57 zap receipt
interface ZapReceiptEvent extends NostrEvent {
  kind: 9735
}

// NIP-57 zap request
interface ZapRequestEvent extends NostrEvent {
  kind: 9734
}

// NIP-98 HTTP auth
interface NIP98AuthEvent extends NostrEvent {
  kind: 27235
}
```

## Utility Types

### Additional Links

```typescript
interface AdditionalLink {
  label: string
  url: string
}
```

### Pagination

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

### API Response

```typescript
interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
}

interface ApiErrorResponse {
  error: string
  details?: any
}
```

## Type Transformations

### Prisma to TypeScript

Adapters transform Prisma types to TypeScript:

```typescript
// src/lib/db-adapter.ts
function transformCourse(prismaCourse: PrismaCourse): Course {
  return {
    ...prismaCourse,
    noteId: prismaCourse.noteId ?? undefined,
    createdAt: prismaCourse.createdAt.toISOString(),
    updatedAt: prismaCourse.updatedAt.toISOString(),
    user: prismaCourse.user ? transformUser(prismaCourse.user) : undefined,
  }
}
```

### Display Creation

Merge database and Nostr data:

```typescript
// src/data/types.ts
function createCourseDisplay(
  course: Course,
  parsed: ParsedCourseEvent
): CourseDisplay {
  return {
    ...course,
    title: parsed.title,
    description: parsed.description,
    image: parsed.image,
    topics: parsed.topics,
    instructor: parsed.instructor,
    lessonCount: parsed.lessonIds.length,
    type: 'course',
    isPremium: course.price > 0,
    purchased: course.purchased ?? false,
  }
}
```

## Zod Schemas (Zod 4)

API request validation. Zod 4 uses standalone schemas for common formats:

```typescript
// src/lib/api-utils.ts
import { z } from 'zod'

const CourseCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.string().min(1),
  instructor: z.string().optional(),
  image: z.string().url().optional(),  // z.url() and z.string().url() both validate URLs and return strings
})

const CourseFilterSchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  search: z.string().optional(),
})

// Common Zod 4 standalone schemas:
// z.uuid()    - UUID validation (RFC 4122 compliant)
// z.url()     - URL validation (uses new URL() internally)
// z.email()   - Email validation

// Infer types from schemas
type CourseCreateData = z.infer<typeof CourseCreateSchema>
type CourseFilters = z.infer<typeof CourseFilterSchema>
```

## WebLN Types

```typescript
// src/types/webln.d.ts
interface WebLN {
  enable(): Promise<void>
  sendPayment(paymentRequest: string): Promise<SendPaymentResponse>
  makeInvoice(args: { amount: number; defaultMemo?: string }): Promise<{ paymentRequest: string }>
}

interface SendPaymentResponse {
  preimage: string
}

declare global {
  interface Window {
    webln?: WebLN
  }
}
```

## Related Documentation

- [database-schema.md](./database-schema.md) - Database models
- [nostr-events.md](./nostr-events.md) - Nostr event structures
- [api-patterns.md](./api-patterns.md) - API validation schemas
