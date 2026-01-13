# Content Configuration

Deep-dive reference for `config/content.json` - homepage sections, content filtering, search settings, and content icons.

## File Location

```
config/content.json
```

## Accessor File

```
src/lib/content-config.ts
```

## Schema Overview

```json
{
  "icons": { "contentTypes": {}, "categories": {} },
  "homepage": { "sections": {}, "sectionOrder": [] },
  "contentPage": { "filters": {}, "includeLessonResources": {}, "imageFetch": {} },
  "search": {},
  "global": { "categories": [], "priceFilterOptions": {}, "sortOptions": {} },
  "_comments": {}
}
```

## Icons Configuration

### contentTypes

Icons for each content type.

| Key | Default | Description |
|-----|---------|-------------|
| `course` | `"BookOpen"` | Course content type |
| `video` | `"Video"` | Video resource type |
| `document` | `"FileText"` | Document resource type |

### categories

Icons for content category badges.

| Key | Default | Description |
|-----|---------|-------------|
| `bitcoin` | `"CircleDollarSign"` | Bitcoin category |
| `lightning` | `"Zap"` | Lightning Network |
| `nostr` | `"Rss"` | Nostr protocol |
| `frontend` | `"Code"` | Frontend development |
| `backend` | `"Server"` | Backend development |
| `mobile` | `"Smartphone"` | Mobile development |
| `security` | `"Shield"` | Security topics |
| `web3` | `"Globe"` | Web3/decentralized |

## Homepage Configuration

### sections

Each section (courses, documents, videos) has this structure:

```json
{
  "enabled": true,
  "title": "Courses",
  "description": "Structured learning paths...",
  "filters": {
    "priceFilter": "all",
    "categories": [],
    "maxItems": 12,
    "sortBy": "newest"
  },
  "carousel": {
    "itemsPerView": {
      "mobile": 1,
      "tablet": 2,
      "desktop": 3
    },
    "autoplay": false,
    "loop": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Show/hide section on homepage |
| `title` | string | Section heading |
| `description` | string | Section description |

### filters

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `priceFilter` | string | `"all"`, `"free"`, `"paid"` | Filter by price |
| `categories` | string[] | Category names | Filter by category (empty = all) |
| `maxItems` | number | Positive integer | Maximum items to show |
| `sortBy` | string | `"newest"`, `"oldest"`, `"price-low"`, `"price-high"`, `"popular"` | Sort order |

### carousel

| Field | Type | Description |
|-------|------|-------------|
| `itemsPerView.mobile` | number | Items on mobile (< 768px) |
| `itemsPerView.tablet` | number | Items on tablet (768-1024px) |
| `itemsPerView.desktop` | number | Items on desktop (> 1024px) |
| `autoplay` | boolean | Auto-advance carousel |
| `loop` | boolean | Loop back to start |

### sectionOrder

Array defining homepage section order:

```json
["courses", "videos", "documents"]
```

Only enabled sections are rendered; unrecognized keys are ignored.

## Content Page Configuration

### filters

```json
{
  "defaultView": "grid",
  "itemsPerPage": 12,
  "enableSearch": true,
  "enableFilters": true,
  "enableSorting": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `defaultView` | `"grid"` \| `"list"` | Default layout mode |
| `itemsPerPage` | number | Pagination size |
| `enableSearch` | boolean | Show search input |
| `enableFilters` | boolean | Show filter controls |
| `enableSorting` | boolean | Show sort dropdown |

### includeLessonResources

```json
{
  "videos": true,
  "documents": true
}
```

Controls whether resources linked to lessons are visible on `/content`. Default `true` keeps them discoverable.

### imageFetch

```json
{
  "relaySet": "default",
  "maxConcurrentFetches": 6
}
```

| Field | Type | Description |
|-------|------|-------------|
| `relaySet` | string | Relay set from nostr.json for image fetching |
| `maxConcurrentFetches` | number | Concurrent fetch limit to avoid relay flooding |

## Search Configuration

```json
{
  "minKeywordLength": 3,
  "timeout": 15000,
  "limit": 100,
  "relaySet": "default"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `minKeywordLength` | number | Minimum characters before search executes |
| `timeout` | number | Relay query timeout in milliseconds |
| `limit` | number | Maximum events to fetch |
| `relaySet` | string | Relay set from nostr.json for search queries |

**Search Behavior:**
- Only searches content authored by pubkeys in `admin.json` (admins + moderators)
- Uses database-first approach: fetches IDs from database, then queries Nostr
- Client-side keyword matching with relevance scoring

## Global Configuration

### categories

Master list of available categories:

```json
["bitcoin", "lightning", "nostr", "frontend", "backend", "mobile", "security", "web3"]
```

Content items should use categories from this list.

### priceFilterOptions

Labels for price filter dropdown:

```json
{
  "all": "All Content",
  "free": "Free Only",
  "paid": "Paid Only"
}
```

### sortOptions

Labels for sort dropdown:

```json
{
  "newest": "Newest First",
  "oldest": "Oldest First",
  "price-low": "Price: Low to High",
  "price-high": "Price: High to Low",
  "popular": "Most Popular"
}
```

## Usage Examples

### Get Config

```typescript
import {
  getContentConfig,
  getHomepageSectionConfig,
  getEnabledHomepageSections
} from '@/lib/content-config'

const config = getContentConfig()
const coursesConfig = getHomepageSectionConfig('courses')
const enabledSections = getEnabledHomepageSections()
```

### Get Icons

```typescript
import { getContentTypeIcon, getCategoryIcon } from '@/lib/content-config'

const CourseIcon = getContentTypeIcon('course')
const BitcoinIcon = getCategoryIcon('bitcoin')

// Usage
<CourseIcon className="h-5 w-5" />
```

### Apply Filters

```typescript
import {
  filterContentByPrice,
  filterContentByCategories,
  sortContent,
  applyContentFilters
} from '@/lib/content-config'

// Individual filters
const freeItems = filterContentByPrice(items, 'free')
const bitcoinItems = filterContentByCategories(items, ['bitcoin'])
const sorted = sortContent(items, 'newest')

// Apply all filters from config
const filtered = applyContentFilters(items, sectionConfig.filters)
```

### TypeScript Types

```typescript
import type {
  ContentConfig,
  ContentSection,
  ContentSectionFilters,
  CarouselConfig,
  PriceFilter,
  SortOption,
  ContentType
} from '@/lib/content-config'
```

## Configuration Recipes

### Free Content Only Homepage

```json
{
  "homepage": {
    "sections": {
      "courses": {
        "enabled": true,
        "filters": { "priceFilter": "free" }
      },
      "videos": {
        "enabled": true,
        "filters": { "priceFilter": "free" }
      }
    }
  }
}
```

### Single Category Focus

```json
{
  "homepage": {
    "sections": {
      "courses": {
        "enabled": true,
        "filters": {
          "categories": ["bitcoin"],
          "maxItems": 6
        }
      }
    }
  }
}
```

### Disable Content Page Search

```json
{
  "contentPage": {
    "filters": {
      "enableSearch": false,
      "enableFilters": true,
      "enableSorting": true
    }
  }
}
```

### Custom Search Timeout

```json
{
  "search": {
    "timeout": 30000,
    "limit": 200,
    "minKeywordLength": 2
  }
}
```

## Related Documentation

- [config-system.md](../config-system.md) - Config system overview
- [search-system.md](../search-system.md) - Search implementation
- [nostr-config.md](./nostr-config.md) - Relay configuration
