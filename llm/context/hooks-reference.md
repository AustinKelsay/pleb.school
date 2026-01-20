# Hooks Reference

Complete reference for React hooks in pleb.school. Located in `src/hooks/`.

## Data Fetching Hooks

### useCoursesQuery

Fetches published courses with React Query caching.

```typescript
import { useCoursesQuery } from '@/hooks/useCoursesQuery'

function CoursesPage() {
  const { data, isLoading, error } = useCoursesQuery()

  // data: Course[] - Array of published courses
}
```

### useResourcesQuery / usePublishedContentQuery

Fetches published resources (videos, documents).

```typescript
import { usePublishedContentQuery } from '@/hooks/usePublishedContentQuery'

function ContentPage() {
  const { data, isLoading, error } = usePublishedContentQuery({
    type: 'all' // 'all' | 'courses' | 'resources'
  })
}
```

### useVideosQuery

Fetches video resources only.

```typescript
import { useVideosQuery } from '@/hooks/useVideosQuery'

const { data: videos, isLoading } = useVideosQuery()
```

### useDocumentsQuery

Fetches document resources only.

```typescript
import { useDocumentsQuery } from '@/hooks/useDocumentsQuery'

const { data: documents, isLoading } = useDocumentsQuery()
```

### useLessonsQuery

Fetches lessons for a specific course.

```typescript
import { useLessonsQuery } from '@/hooks/useLessonsQuery'

const { data: lessons, isLoading } = useLessonsQuery(courseId)
// Returns ordered lessons with resource/draft data
```

## Draft Hooks

### useDraftsQuery

Fetches the current user's drafts.

```typescript
import { useDraftsQuery } from '@/hooks/useDraftsQuery'

const { data: drafts, isLoading } = useDraftsQuery()
// Returns user's resource and course drafts
```

### useAllDraftsQuery

Fetches all drafts (admin only).

```typescript
import { useAllDraftsQuery } from '@/hooks/useAllDraftsQuery'

const { data: allDrafts, isLoading } = useAllDraftsQuery()
```

### useCourseDraftQuery

Fetches a specific course draft with lessons.

```typescript
import { useCourseDraftQuery } from '@/hooks/useCourseDraftQuery'

const { data: courseDraft, isLoading } = useCourseDraftQuery(draftId)
// Returns draft with draftLessons array
```

### useResourceDraftQuery

Fetches a specific resource draft.

```typescript
import { useResourceDraftQuery } from '@/hooks/useResourceDraftQuery'

const { data: resourceDraft, isLoading } = useResourceDraftQuery(draftId)
```

### usePublishDraft

Mutation hook for publishing drafts to Nostr.

```typescript
import { usePublishDraft } from '@/hooks/usePublishDraft'

function PublishDraftComponent({ draft, draftType }: { draft: any, draftType: 'resource' | 'course' }) {
  const { publishDraft, isPublishing, error } = usePublishDraft()

  // Handle publishing resource draft
  const handlePublishResource = async () => {
    try {
      await publishDraft({
        type: 'resource',
        draftId: draft.id,
        signedEvent: signedNostrEvent // If NIP-07 user
      })
      // Handle success (e.g., redirect, show toast)
    } catch (err) {
      console.error('Failed to publish:', err)
    }
  }

  // Handle publishing course draft
  const handlePublishCourse = async () => {
    try {
      await publishDraft({
        type: 'course',
        draftId: draft.id,
        signedEvent: signedCourseEvent,
        lessonEvents: signedLessonEvents
      })
      // Handle success
    } catch (err) {
      console.error('Failed to publish:', err)
    }
  }

  return (
    <button 
      onClick={draftType === 'resource' ? handlePublishResource : handlePublishCourse}
      disabled={isPublishing}
    >
      {isPublishing ? 'Publishing...' : 'Publish'}
      {error && <span>Error: {error.message}</span>}
    </button>
  )
}
```

## Purchase & Payment Hooks

### usePurchasesQuery

Fetches the current user's purchases.

```typescript
import { usePurchasesQuery } from '@/hooks/usePurchasesQuery'

const { data: purchases, isLoading } = usePurchasesQuery()
// Returns Purchase[] with course/resource details
```

### usePurchaseEligibility

Checks purchase eligibility and handles auto-claim.

```typescript
import { usePurchaseEligibility } from '@/hooks/usePurchaseEligibility'

const {
  eligible,        // boolean - zaps >= price
  status,          // 'idle' | 'pending' | 'success' | 'error'
  purchase,        // Purchase | null
  error,           // string | null
  claimPurchase,   // (args?) => Promise<Purchase | null>
  resetError       // () => void
} = usePurchaseEligibility({
  resourceId,               // or courseId
  priceSats: 2100,
  viewerZapTotalSats: 3000,
  alreadyPurchased: false,
  autoClaim: true,          // Auto-claim when eligible
  zapReceipts,              // From useInteractions
  eventId,                  // Content's Nostr event ID
  eventPubkey,              // Content owner's pubkey
  onAutoClaimSuccess: (purchase) => console.log('Claimed!'),
  onAutoClaimError: (error) => console.error(error)
})
```

### useZapFormState

Manages zap dialog form state.

```typescript
import { useZapFormState } from '@/hooks/useZapFormState'

const {
  amount,
  setAmount,
  note,
  setNote,
  isPrivacy,
  setIsPrivacy,
  selectedQuickIndex,
  setSelectedQuickIndex,
  reset
} = useZapFormState({
  defaultAmount: 21,
  quickAmounts: [21, 100, 500, 1000, 2100]
})
```

### useZapSender

Handles the complete zap sending flow.

```typescript
import { useZapSender } from '@/hooks/useZapSender'

const {
  zapState,     // { status, invoice, error, ... }
  sendZap,      // (amount, note, privacyMode) => Promise
  reset,        // () => void
  retryWebLN    // () => Promise
} = useZapSender({
  zapTarget: {
    lud16: 'user@getalby.com',
    pubkey: '...',
    relayHints: ['wss://relay.example.com']
  },
  eventId,
  eventKind,
  eventIdentifier,
  eventPubkey
})

// Status flow: idle → resolving → signing → requesting-invoice →
//              invoice-ready → paying → success|error
```

## Nostr Hooks

### useNostr

Core hook for Nostr relay interactions.

```typescript
import { useNostr } from '@/hooks/useNostr'

const {
  fetchSingleEvent,  // (filter, options?) => Promise<NostrEvent | null>
  fetchProfile,      // (pubkey) => Promise<NormalizedProfile | null>
  fetchEvents,       // (filter, options?) => Promise<NostrEvent[]>
  publishEvent,      // (event) => Promise<void>
  normalizePubkey    // (input) => string
} = useNostr()

// Fetch single event
const event = await fetchSingleEvent({
  kinds: [30023],
  '#d': ['event-identifier']
})

// Fetch profile
const profile = await fetchProfile('npub1...')
```

### useNostrSearch

Search Nostr events by filters.

```typescript
import { useNostrSearch } from '@/hooks/useNostrSearch'

const { search, results, isSearching, error } = useNostrSearch()

// Search for content
await search({
  kinds: [30023, 30402],
  search: 'bitcoin lightning'
})
```

### useInteractions

Fetches zaps, comments, and likes for content.

```typescript
import { useInteractions } from '@/hooks/useInteractions'

const {
  counts,              // { zaps, likes, comments, replies, threadComments }
  zapInsights,         // { totalSats, averageSats, uniqueSenders, lastZapAt }
  recentZaps,          // ZapReceiptSummary[]
  viewerZaps,          // ZapReceiptSummary[] - current user's zaps
  viewerZapTotalSats,  // number
  hasZappedWithLightning,
  isLoading,
  error
} = useInteractions({
  eventId,
  eventKind,
  eventIdentifier,
  eventPubkey
})
```

### useCourseNotes / useResourceNotes

Fetches Nostr notes/discussions for content.

```typescript
import { useCourseNotes } from '@/hooks/useCourseNotes'
import { useResourceNotes } from '@/hooks/useResourceNotes'

const { notes: courseNotes, isLoading: courseNotesLoading } = useCourseNotes(courseNoteId)
const { notes: resourceNotes, isLoading: resourceNotesLoading } = useResourceNotes(resourceNoteId)
```

### useCommentThreads

Fetches zap reply threads.

```typescript
import { useCommentThreads } from '@/hooks/useCommentThreads'

const { threads, isLoading } = useCommentThreads({
  eventId,
  eventPubkey
})
```

## Utility Hooks

### useSession

Enhanced NextAuth session hook.

```typescript
import { useSession } from '@/hooks/useSession'

const { data: session, status } = useSession()
// session.user includes pubkey, provider, isAdmin, etc.
```

### useIsAdmin

Checks if current user is an admin or moderator using session data (fast, config-based).

```typescript
import { useIsAdmin } from '@/hooks/useAdmin'

const { isAdmin, isModerator, hasAdminOrModerator, loading } = useIsAdmin()
```

### useCanViewOwnAnalytics

Checks if user has permission to view analytics for their own content.

```typescript
import { useCanViewOwnAnalytics } from '@/hooks/useAdmin'

const { hasPermission: canViewOwnAnalytics, loading } = useCanViewOwnAnalytics()
```

### useCanViewPlatformAnalytics

Checks if user has permission to view platform-wide analytics (admin/moderator only).

```typescript
import { useCanViewPlatformAnalytics } from '@/hooks/useAdmin'

const { hasPermission: canViewPlatformAnalytics, loading } = useCanViewPlatformAnalytics()
```

### useContentConfig

Accesses content configuration from config/content.json.

```typescript
import { useContentConfig } from '@/hooks/useContentConfig'

const {
  contentTypes,
  categories,
  filters,
  icons
} = useContentConfig()
```

### useViews

Tracks and displays view counts.

```typescript
import { useViews } from '@/hooks/useViews'

const { viewCount, incrementView } = useViews({
  contentId,
  contentType: 'resource' // or 'course'
})

// Increment on page load (incrementView should be memoized in the hook)
useEffect(() => { incrementView() }, [incrementView])
```

### usePrefetch / usePrefetchContent

Prefetches content for performance.

```typescript
import { usePrefetch } from '@/hooks/usePrefetch'
import { usePrefetchContent } from '@/hooks/usePrefetchContent'
import Link from 'next/link'

// Prefetch on hover with Link
const prefetch = usePrefetch()

<Link 
  href="/courses/123"
  onMouseEnter={() => prefetch.prefetchCourse('123')}
>
  Course Title
</Link>

// Or use content-aware prefetching
const { prefetchRelated } = usePrefetch()
prefetchRelated({ type: 'course', id: '123' })

// Use prefetchContent hook for bulk prefetching on component mount
usePrefetchContent({
  prefetchCourses: true,
  prefetchVideos: true,
  prefetchDocuments: true
})
```

### useDebounce

Debounces a value.

```typescript
import { useDebounce } from '@/hooks/use-debounce'
import { useState, useEffect, useCallback } from 'react'

const [searchTerm, setSearchTerm] = useState('')
const debouncedSearch = useDebounce(searchTerm, 300)

const performSearch = useCallback((term: string) => {
  // Search logic here
  console.log('Searching for:', term)
}, [])

useEffect(() => {
  // Only fires 300ms after last change
  performSearch(debouncedSearch)
}, [debouncedSearch, performSearch])
```

## Mutation Hooks

### usePublishedContentMutations

Mutations for published content (admin).

```typescript
import { usePublishedContentMutations } from '@/hooks/usePublishedContentMutations'

const {
  updateCourse,
  deleteCourse,
  updateResource,
  deleteResource,
  republishCourse,
  republishResource
} = usePublishedContentMutations()

// Update course price
await updateCourse({
  id: courseId,
  price: 2100
})

// Republish to Nostr
await republishCourse(courseId, signedEvent)
```

## Hook Patterns

### React Query Integration

Most data hooks use React Query:

```typescript
// Standard pattern
const { data, isLoading, error, refetch } = useCoursesQuery()

// With options
const { data } = useCoursesQuery({
  enabled: !!userId,
  staleTime: 5 * 60 * 1000
})
```

### Session Dependencies

Hooks that need authentication:

```typescript
// Internal pattern - hooks handle session internally
function usePurchasesQuery() {
  const { data: session, status } = useSession()

  return useQuery({
    queryKey: ['purchases', session?.user?.id],
    queryFn: fetchPurchases,
    enabled: status === 'authenticated'
  })
}
```

### Nostr Event Handling

Hooks that work with Nostr events:

```typescript
// Events are fetched from relays via useNostr
const { fetchSingleEvent } = useNostr()
const event = await fetchSingleEvent({
  kinds: [30023],
  '#d': [identifier]
})

// Parse with utility functions
const parsed = parseEvent(event)
```

## Related Documentation

- [data-architecture.md](./data-architecture.md) - Data adapters
- [nostr-events.md](./nostr-events.md) - Nostr event structures
- [purchases-and-zaps.md](./purchases-and-zaps.md) - Purchase system
- [components-architecture.md](./components-architecture.md) - Component patterns
