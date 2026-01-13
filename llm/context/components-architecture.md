# Components Architecture

React component organization and patterns for pleb.school. Uses Next.js 15 App Router with React 19.

## Directory Structure

```text
src/components/
├── layout/               # Page layout components
│   ├── header.tsx
│   ├── main-layout.tsx
│   └── container.tsx
├── ui/                   # shadcn/ui base components
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   └── ...
├── content/              # Content display components
│   ├── content-card.tsx
│   ├── search-result-card.tsx
│   └── resource-content-view.tsx
├── purchase/             # Purchase system
│   ├── purchase-dialog.tsx
│   ├── purchase-actions.tsx
│   └── purchase-list.tsx
├── zap/                  # Zap components
│   ├── zap-dialog.tsx
│   └── zap-threads.tsx
├── profile/              # Profile components
│   └── components/
│       ├── profile-display.tsx
│       ├── profile-edit.tsx
│       └── ...
├── theme/                # Theme controls
│   ├── theme-toggle.tsx
│   └── font-toggle.tsx
└── common/               # Shared components
    ├── optimized-image.tsx
    ├── video-player.tsx
    └── markdown-renderer.tsx
```

## Component Patterns

### Export Conventions

```typescript
// Pages: Default export
export default function CoursesPage() { ... }

// Components: Named export
export const ContentCard = ({ ... }) => { ... }

// Or function declaration
export function ContentCard({ ... }) { ... }
```

### Client vs Server Components

```typescript
// Server Component (default)
async function CourseList() {
  const courses = await CourseAdapter.findAll()
  return <div>{courses.map(...)}</div>
}

// Client Component (explicit)
'use client'
import { useState } from 'react'

export function ZapDialog() {
  const [amount, setAmount] = useState(21)
  // ...
}
```

### Props Interfaces

```typescript
interface ContentCardProps {
  item: CourseDisplay | ResourceDisplay
  showPrice?: boolean
  className?: string
}

export const ContentCard = ({
  item,
  showPrice = true,
  className
}: ContentCardProps) => { ... }
```

## UI Component Library

### shadcn/ui Base

Located in `src/components/ui/`:

```typescript
// Re-exported from shadcn
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog'
```

### Common Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Button | ui/button.tsx | Primary button styles |
| Card | ui/card.tsx | Content containers |
| Dialog | ui/dialog.tsx | Modal dialogs |
| AlertDialog | ui/alert-dialog.tsx | Confirmation dialogs |
| Badge | ui/badge.tsx | Labels/tags |
| Avatar | ui/avatar.tsx | User avatars |
| Input | ui/input.tsx | Text inputs |
| Textarea | ui/textarea.tsx | Multi-line input |
| Select | ui/select.tsx | Dropdowns |
| Skeleton | ui/skeleton.tsx | Loading states |
| Tabs | ui/tabs.tsx | Tab navigation |
| Tooltip | ui/tooltip.tsx | Hover tooltips |

## Layout Components

### MainLayout

```typescript
// src/components/layout/main-layout.tsx
export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
```

### Container

```typescript
// src/components/layout/container.tsx
export function Container({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('container mx-auto px-4', className)}>
      {children}
    </div>
  )
}
```

## Content Components

### ContentCard

Unified card for courses and resources:

```typescript
export const ContentCard = ({ item }: { item: CourseDisplay | ResourceDisplay }) => {
  const isCourse = item.type === 'course'
  const href = isCourse ? `/courses/${item.id}` : `/content/${item.id}`

  return (
    <Link href={href}>
      <Card>
        <OptimizedImage src={item.image} alt={item.title} />
        <CardHeader>
          <h3>{item.title}</h3>
          <Badge>{item.type}</Badge>
        </CardHeader>
        <CardContent>
          <p>{item.description || item.summary}</p>
          {item.price > 0 && <PriceBadge price={item.price} />}
        </CardContent>
      </Card>
    </Link>
  )
}
```

### OptimizedImage

Handles images from any domain:

```typescript
// src/components/common/optimized-image.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'

export function OptimizedImage({ src, alt, ...props }) {
  // Auto-handles unknown domains with unoptimized prop
  const [error, setError] = useState(false)

  if (error || !src) {
    return <div className="bg-muted" {...props} />
  }

  return (
    <Image
      src={src}
      alt={alt}
      unoptimized={!isKnownDomain(src)}
      onError={() => setError(true)}
      {...props}
    />
  )
}
```

**Important**: Use this instead of adding domains to `next.config.ts`.

## Form Components

### Pattern

```typescript
'use client'

export function CreateDraftForm() {
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      const result = await createDraft(formData)
      if (result.success) {
        router.push(`/drafts/${result.id}`)
      }
    })
  }

  return (
    <form action={handleSubmit}>
      <Input name="title" required />
      <Textarea name="content" required />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Draft'}
      </Button>
    </form>
  )
}
```

## Loading States

### Skeleton Components

```typescript
// src/components/content/content-skeleton.tsx
export function ContentSkeleton() {
  return (
    <Card>
      <Skeleton className="h-48 w-full" />
      <CardHeader>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
    </Card>
  )
}

// Usage
{isLoading ? (
  <div className="grid grid-cols-3 gap-4">
    {[1,2,3].map(i => <ContentSkeleton key={i} />)}
  </div>
) : (
  <ContentGrid items={courses} />
)}
```

## Icon Usage

Module-level resolution (recommended):

```typescript
import { getNavigationIcon } from '@/lib/copy-icons'

// Resolve ONCE at module load
const MenuIcon = getNavigationIcon('menu')
const SearchIcon = getNavigationIcon('search')

export function Header() {
  return (
    <header>
      <MenuIcon className="h-6 w-6" />
      <SearchIcon className="h-4 w-4" />
    </header>
  )
}
```

See [icon-system.md](../implementation/icon-system.md) for details.

## Context Providers

```typescript
// src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <QueryProvider>
          <SessionProvider>
            <ThemeProvider>
              <SnstrProvider>
                {children}
              </SnstrProvider>
            </ThemeProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
```

## State Management

### React Query

For server data:

```typescript
const { data, isLoading, error } = useCoursesQuery()
```

### Local State

For UI state:

```typescript
const [isOpen, setIsOpen] = useState(false)
```

### Context

For shared client state:

```typescript
const { theme, setTheme } = useTheme()
```

## Best Practices

1. **Server Components first**: Default to server, add `'use client'` only when needed
2. **Composition over props**: Use children and slots
3. **Consistent naming**: PascalCase for components
4. **Type props**: Always define interfaces
5. **Handle loading**: Always show loading states
6. **Handle errors**: Always handle error states
7. **Accessible**: Include ARIA attributes

## Related Documentation

- [hooks-reference.md](./hooks-reference.md) - React hooks
- [routing-patterns.md](./routing-patterns.md) - Page structure
- [icon-system.md](../implementation/icon-system.md) - Icon patterns
