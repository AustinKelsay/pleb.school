# Search System

Client-side keyword search for courses and resources. Located in `src/lib/search.ts`.

## Overview

Search operates on pre-loaded content, matching keywords against titles, descriptions, and content. No server-side search index is used.

## Basic Usage

```typescript
import { searchContent, searchCourses, searchResources } from '@/lib/search'

// Search all content
const results = searchContent(courses, resources, 'bitcoin lightning')

// Search only courses
const courseResults = searchCourses(courses, 'beginner')

// Search only resources
const resourceResults = searchResources(resources, 'tutorial')
```

## Search Result

```typescript
interface SearchResult {
  id: string
  type: 'course' | 'resource'
  title: string
  description: string
  category: string
  instructor: string
  image?: string
  rating: number
  price: number
  isPremium: boolean
  matchScore: number           // Relevance score
  keyword: string              // Original search term
  tags?: string[]
  matchedFields?: MatchedField[]
  highlights: {
    title?: string             // HTML with <mark> tags
    description?: string
  }
}

type MatchedField = 'title' | 'description' | 'content' | 'tags'
```

## Scoring Algorithm

**Note:** Search functions short-circuit if `keyword.length < 3` (minimum 3 characters required).

```typescript
// src/lib/search.ts
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function calculateMatchScore(keyword: string, title: string, description: string): number {
  // Case-insensitive matching
  const lowerKeyword = keyword.toLowerCase()
  const lowerTitle = title.toLowerCase()
  const lowerDescription = description.toLowerCase()

  let score = 0

  // Exact title match (highest)
  if (lowerTitle === lowerKeyword) score += 100

  // Title starts with keyword
  else if (lowerTitle.startsWith(lowerKeyword)) score += 50

  // Title contains keyword
  else if (lowerTitle.includes(lowerKeyword)) score += 30

  // Description occurrences (defaults to 1 if includes but no regex match)
  if (lowerDescription.includes(lowerKeyword)) {
    const matches = lowerDescription.match(new RegExp(escapeRegExp(lowerKeyword), 'g'))
    score += (matches?.length || 1) * 5
  }

  // Word boundary matches (whole word)
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(lowerKeyword)}\\b`, 'gi')
  if (wordBoundaryRegex.test(title)) score += 20
  if (wordBoundaryRegex.test(description)) score += 10

  return score
}
```

## Search Suggestions

```typescript
import { getSearchSuggestions } from '@/lib/search'

// Get autocomplete suggestions
const suggestions = getSearchSuggestions(
  courses,
  resources,
  'bit',     // Partial keyword
  5          // Limit
)
// Returns: ['Bitcoin Basics', 'Bitcoin Lightning', ...]
```

## Filtering

```typescript
import { filterSearchResults } from '@/lib/search'

interface SearchFilters {
  category?: string
  priceRange?: { min: number; max: number }
  type?: 'course' | 'resource'
  isPremium?: boolean
}

const filtered = filterSearchResults(results, {
  type: 'course',
  isPremium: true,
  priceRange: { min: 0, max: 10000 }
})
```

## Security

### ReDoS Prevention

Keywords are escaped before regex operations:

```typescript
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Safe regex construction
const regex = new RegExp(escapeRegExp(keyword), 'gi')
```

### Minimum Length

Searches require minimum 3 characters:

```typescript
if (!keyword || keyword.length < 3) return []
```

## Highlighting

```typescript
import { sanitizeContent } from '@/lib/content-utils'

function highlightKeyword(text: string, keyword: string): string {
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

// Sanitize before highlighting to prevent XSS
const titleSanitized = sanitizeContent(title)
const descriptionSanitized = sanitizeContent(description)

highlights: {
  title: highlightKeyword(titleSanitized, keyword),
  description: highlightKeyword(descriptionSanitized, keyword)
}

// Render safely (text is already sanitized before highlighting)
<div dangerouslySetInnerHTML={{ __html: result.highlights.title }} />
```

## Server Action

Search via server action for form submissions:

```typescript
// src/lib/actions.ts
'use server'

export async function searchCourses(formData: FormData) {
  const query = formData.get('query') as string

  // Fetch courses with notes
  const courses = await CourseAdapter.findAllWithNotes()

  // Search
  const results = searchCoursesLib(courses, query)

  return results
}
```

## useNostrSearch Hook

Alternative: Search Nostr relays directly using the React Query-based hook:

```typescript
import { useNostrSearch, useNostrSearchByKind } from '@/hooks/useNostrSearch'

// Basic usage - executes automatically when keyword meets min length (3 chars)
// Searches kinds 30004 (courses), 30023 (articles), 30402 (paid content)
const { results, isLoading, isError, error, refetch } = useNostrSearch('bitcoin')

// For specific kinds only
const { results, isLoading } = useNostrSearchByKind('bitcoin', [30023])
```

## Search Page

Located at `/search`:

```typescript
// src/app/search/page.tsx
function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const { data: courses } = useCoursesQuery()
  const { data: resources } = usePublishedContentQuery()

  const results = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) return []
    return searchContent(courses, resources, debouncedQuery)
  }, [courses, resources, debouncedQuery])

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <SearchResults results={results} />
    </div>
  )
}
```

## Performance Considerations

1. **Pre-loaded data**: Content fetched via React Query
2. **Debounced input**: 300ms delay before search
3. **Client-side**: No network latency for search
4. **Memoization**: Results cached with useMemo

## Limitations

1. No fuzzy matching (exact substring only)
2. No stemming or synonyms
3. Limited to loaded content
4. No ranking by recency or popularity

## Related Documentation

- [hooks-reference.md](./hooks-reference.md) - useNostrSearch
- [data-architecture.md](./data-architecture.md) - Content adapters
