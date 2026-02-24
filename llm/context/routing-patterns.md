# Routing Patterns

URL structure and content-type routing for pleb.school. Uses Next.js App Router.

## Route Structure

```text
/                           Homepage
/courses                    Course listing
/courses/[id]               Course detail
/courses/[id]/lessons/[lessonId]  Lesson viewer
/content                    Resource listing (videos + documents)
/content/[id]               Resource detail
/search                     Search page
/feeds                      Nostr feeds
/subscribe                  Newsletter
/about                      About page
/sitemap.xml                Runtime-generated sitemap (dynamic; DB-backed URLs when available)
/robots.txt                 Robots directives

/auth/signin                Login
/auth/verify-request        Email verification wait
/auth/error                 Auth error

/profile                    User profile (tabs: overview, purchases, settings)
/settings                   User settings
/drafts                     User's drafts
/drafts/resources/[id]      Resource draft editor
/drafts/resources/[id]/preview   Draft preview
/drafts/resources/[id]/publish   Publish confirmation
/drafts/courses/[id]        Course draft editor
/drafts/courses/[id]/lessons/[lessonId]   Lesson editor
/drafts/courses/[id]/publish    Publish confirmation

/api/*                      API routes
```

## Content Type Routing

**Critical Pattern**: Route by content type, not UI variant.

```typescript
// CORRECT: Route by type
if (item.type === 'course') {
  router.push(`/courses/${item.id}`)
} else {
  router.push(`/content/${item.id}`)
}

// WRONG: Single route for all content
router.push(`/content/${item.id}`)  // Doesn't distinguish courses
```

### Universal Router Helper

```typescript
import { getUniversalRoute, resolveUniversalId, getRoutePath } from '@/lib/universal-router'

// High-level: pass any ID format, get the correct route path
const path = getUniversalRoute(item.id)
// Course → /courses/123
// Resource → /content/456

// Lower-level: resolve ID first, then get route
const resolved = resolveUniversalId(item.id)  // returns { resolvedId, contentType, ... }
const route = getRoutePath(resolved)
```

## Dynamic Routes

### Course Routes

```text
/courses/[id]
  └── params: { id: string }  // Course ID (custom string slug, e.g., 'welcome-to-pleb-school')

/courses/[id]/lessons/[lessonId]
  └── params: { id: string, lessonId: string }  // Course ID (slug) + Lesson UUID
```

## Metadata Routes

- `/sitemap.xml` is served by `src/app/sitemap.ts` as a dynamic Node route.
- Behavior:
  - Always returns static route entries.
  - Adds DB-backed course/resource URLs when database access succeeds.
  - Degrades to static-only entries if DB is temporarily unavailable.

### Resource Routes

```text
/content/[id]
  └── params: { id: string }  // Resource UUID (inherited from Draft.id)
```

### Draft Routes

```text
/drafts/resources/[id]
  └── params: { id: string }  // Draft UUID

/drafts/courses/[id]
  └── params: { id: string }  // Course draft UUID

/drafts/courses/[id]/lessons/[lessonId]
  └── params: { id: string, lessonId: string }
```

## URL Construction

### From Content Items

```typescript
function getContentUrl(item: CourseDisplay | ResourceDisplay): string {
  if (item.type === 'course') {
    return `/courses/${item.id}`
  }
  return `/content/${item.id}`
}

function getLessonUrl(courseId: string, lessonId: string): string {
  return `/courses/${courseId}/lessons/${lessonId}`
}
```

### From Nostr Identifiers

```typescript
import { getUniversalRoute } from '@/lib/universal-router'

// Convert naddr to route - getUniversalRoute handles naddr decoding internally
const path = getUniversalRoute(naddr)
// Returns /courses/123 or /content/456 based on content type
```

## Protected Routes

### Authentication Required

```typescript
// middleware.ts or layout
export const config = {
  matcher: [
    '/profile/:path*',
    '/settings/:path*',
    '/drafts/:path*'
  ]
}

// Layout-level protection
async function ProtectedLayout({ children }) {
  const session = await auth()
  if (!session) {
    redirect('/auth/signin')
  }
  return children
}
```

### Admin Routes

```typescript
// Check in page/route
import { isAdmin } from '@/lib/admin-utils'

async function AdminPage() {
  const session = await auth()
  if (!session?.user?.pubkey || !await isAdmin(session)) {
    redirect('/')
  }
  // Render admin content
}
```

## API Routes

### Pattern

```text
/api/{resource}              GET (list), POST (create)
/api/{resource}/[id]         GET, PUT, DELETE
/api/{resource}/[id]/{action}  POST (custom actions)
```

### Examples

```text
/api/courses                 GET courses, POST new course
/api/courses/[id]            GET course, PUT update, DELETE
/api/courses/[id]/republish  POST republish to Nostr

/api/drafts/resources        GET drafts, POST new draft
/api/drafts/resources/[id]   GET, PUT, DELETE draft
/api/drafts/resources/[id]/publish   POST publish draft
```

## Navigation

### Programmatic

```typescript
import { useRouter } from 'next/navigation'

function ContentCard({ item }) {
  const router = useRouter()

  const handleClick = () => {
    if (item.type === 'course') {
      router.push(`/courses/${item.id}`)
    } else {
      router.push(`/content/${item.id}`)
    }
  }
}
```

### Link Component

```tsx
import Link from 'next/link'

<Link href={`/courses/${course.id}`}>
  {course.title}
</Link>

<Link href={`/content/${resource.id}`}>
  {resource.title}
</Link>
```

## Query Parameters

### Profile Tabs

```text
/profile                     Default (overview)
/profile?tab=purchases       Purchases tab
/profile?tab=settings        Settings tab
/profile?tab=accounts        Linked accounts tab
```

### Content Filters

```text
/courses?category=bitcoin    Filter by category
/content?type=video          Filter by type
/search?q=lightning          Search query
```

### Success/Error States

```text
/profile?tab=accounts&success=github_linked
/profile?tab=accounts&error=linking_failed
/auth/error?error=AccessDenied
```

## Prefetching

```tsx
import { usePrefetch, usePrefetchProps } from '@/hooks/usePrefetch'

// Option 1: Direct method calls
function CourseList({ courses }) {
  const { prefetchCourse } = usePrefetch()

  return courses.map(course => (
    <Link
      key={course.id}
      href={`/courses/${course.id}`}
      onMouseEnter={() => prefetchCourse(course.id)}
    >
      {course.title}
    </Link>
  ))
}

// Option 2: Spread props (includes onMouseEnter + onFocus)
function CourseCard({ course }) {
  const { getPrefetchProps } = usePrefetchProps()

  return (
    <Link href={`/courses/${course.id}`} {...getPrefetchProps('course', course.id)}>
      {course.title}
    </Link>
  )
}
```

**usePrefetch methods:** `prefetchCourse`, `prefetchLesson`, `prefetchResourceNotes`, `prefetchNextPage`, `prefetchRelated`, `isCached`

## Error Pages

```text
/not-found         404 page
/error             Generic error
```

Custom error handling:

```typescript
// app/not-found.tsx
export default function NotFound() {
  return <ErrorPage code={404} message="Page not found" />
}

// app/error.tsx
'use client'
export default function Error({ error, reset }) {
  return <ErrorPage code={500} message={error.message} />
}
```

## Related Documentation

- [api-patterns.md](./api-patterns.md) - API route structure
- [authentication-system.md](./authentication-system.md) - Auth flows
- [data-architecture.md](./data-architecture.md) - Content adapters
