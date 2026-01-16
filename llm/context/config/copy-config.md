# Copy Configuration

Deep-dive reference for `config/copy.json` - all user-facing text, navigation labels, and UI icons.

## File Location

```text
config/copy.json
```

## Accessor Files

| File | Purpose |
|------|---------|
| `src/lib/copy.ts` | Text retrieval with dot-notation access |
| `src/lib/copy-icons.ts` | Icon getters for all UI categories |

## Schema Overview

```json
{
  "icons": {
    "navigation": {},
    "homepage": {},
    "about": {},
    "profile": {},
    "status": {},
    "actions": {},
    "error": {},
    "subscribe": {},
    "feeds": {},
    "course": {}
  },
  "site": {},
  "navigation": {},
  "homepage": {},
  "search": {},
  "verifyEmail": {},
  "subscribe": {},
  "feeds": {},
  "about": {},
  "contentLibrary": {},
  "course": {},
  "resource": {},
  "payments": {},
  "pricing": {},
  "loading": {},
  "errors": {},
  "emptyStates": {},
  "notFound": {},
  "lessons": {},
  "_comments": {}
}
```

## Icons Configuration

### navigation

Header and navigation icons.

| Key | Default | Description |
|-----|---------|-------------|
| `menu` | `"Menu"` | Mobile menu toggle |
| `search` | `"Search"` | Search button |
| `settings` | `"Settings"` | Settings link |
| `profile` | `"UserCircle"` | Profile link |
| `logout` | `"LogOut"` | Logout button |
| `home` | `"Home"` | Home link |
| `back` | `"ArrowLeft"` | Back navigation |
| `forward` | `"ArrowRight"` | Forward navigation |
| `brand` | `"Zap"` | Brand/logo icon |
| `create` | `"Plus"` | Create content |

### homepage

Hero section and CTA icons.

| Key | Default | Description |
|-----|---------|-------------|
| `badge` | `"Sparkles"` | Hero badge |
| `startLearning` | `"BookOpen"` | Primary CTA |
| `watchDemo` | `"Video"` | Secondary CTA |
| `ctaPrimary` | `"Sparkles"` | Footer CTA primary |
| `ctaSecondary` | `"ExternalLink"` | Footer CTA secondary |
| `visualPrimary` | `"Eye"` | Visual element |
| `visualSecondary` | `"Settings"` | Visual element |
| `visualCenter` | `"Zap"` | Visual element |

### about

About page feature pillars.

| Key | Default | Description |
|-----|---------|-------------|
| `creators` | `"GitFork"` | For creators section |
| `platform` | `"Network"` | Platform section |
| `learners` | `"Settings2"` | For learners section |

### profile

Profile page tabs.

| Key | Default | Description |
|-----|---------|-------------|
| `user` | `"User"` | User info tab |
| `activity` | `"Activity"` | Activity tab |
| `settings` | `"Settings"` | Settings tab |
| `accounts` | `"Link2"` | Linked accounts tab |
| `content` | `"FileText"` | User content tab |
| `analytics` | `"BarChart3"` | Analytics tab |

### status

Content status indicators.

| Key | Default | Description |
|-----|---------|-------------|
| `draft` | `"FileEdit"` | Draft status |
| `edit` | `"Edit"` | Edit mode |
| `preview` | `"Eye"` | Preview mode |
| `share` | `"Share2"` | Share action |
| `publish` | `"Share"` | Publish action |

### actions

Common action buttons.

| Key | Default | Description |
|-----|---------|-------------|
| `copy` | `"Copy"` | Copy to clipboard |
| `download` | `"Download"` | Download action |
| `externalLink` | `"ExternalLink"` | External link |
| `info` | `"Info"` | Info/help |

### error

Error and not-found pages.

| Key | Default | Description |
|-----|---------|-------------|
| `notFound` | `"AlertCircle"` | 404 page |
| `serverError` | `"AlertCircle"` | 500 page |
| `refresh` | `"RefreshCw"` | Retry button |

### subscribe / feeds

Coming soon page icons.

| Key | Default | Description |
|-----|---------|-------------|
| `badge` | `"Sparkles"` | Page badge |
| `signal` | `"BellRing"` | Notifications |
| `creators` | `"NotebookPen"` | Creators feature |
| `perks` | `"Gift"` | Perks/benefits |
| `sources` | `"Rss"` | Feed sources |
| `alerts` | `"BellRing"` | Alerts |
| `adaptive` | `"Settings2"` | Adaptive features |

### course

Course-related UI.

| Key | Default | Description |
|-----|---------|-------------|
| `price` | `"DollarSign"` | Price indicators |
| `education` | `"GraduationCap"` | Course headers |

## Text Sections

### site

Global site metadata.

```json
{
  "title": "pleb.school – Nostr-native course & content platform",
  "description": "Open-source, configurable education stack...",
  "brandName": "pleb.school"
}
```

### navigation

Header navigation text.

```json
{
  "searchPlaceholder": "Search content",
  "menuItems": {
    "content": "Content",
    "feeds": "Feeds",
    "subscribe": "Subscribe",
    "about": "About"
  },
  "buttons": { "login": "Login" },
  "accessibility": {
    "toggleTheme": "Toggle theme",
    "selectTheme": "Select theme"
  }
}
```

### homepage

Hero, stats, visual elements, CTA, and section descriptions.

**hero** - Main landing section:
- `badge` - Small label above headline
- `title.line1/line2/line3` - Title lines
- `title.useAnimated` - Enable animated words
- `title.animatedWords` - Words that cycle
- `title.staticWord` - Word when animation disabled
- `description` - Hero description
- `buttons.startLearning/watchDemo` - CTA buttons

**stats** - Platform metrics (configurable array):
```json
{
  "contentTypes": {
    "value": "Courses · Videos · Docs",
    "label": "Multi-format learning content",
    "icon": "BookOpen"
  }
}
```

**visual** - Hero visual element labels.

**cta** - Footer call-to-action section.

**sections** - Content section titles/descriptions.

### search

Search page text.

```json
{
  "title": "Search Content",
  "description": "Search courses and resources from Nostr relays",
  "inputPlaceholder": "Search Nostr content... (min 3 characters)",
  "emptyPrompt": "Please enter at least 3 characters to search",
  "error": "Failed to search. Please try again.",
  "tabs": { "all": "All", "courses": "Courses", "resources": "Resources" },
  "summary": { "prefix": "Found", "resultSingular": "result", "resultPlural": "results", "for": "for" }
}
```

### payments

Purchase and zap dialog text.

**purchaseDialog**:
- `autoClaim.*` - Auto-claim success messages
- `validation.*` - Validation error messages
- `send.*` - Payment flow messages

**zapDialog**:
- `invalidAmount*` - Amount validation
- `success*` - Success messages
- `failed*` - Failure messages
- `status.*` - Progress status labels

### contentLibrary

Content page text.

```json
{
  "title": "Content Library",
  "description": "Discover courses, videos, and documents...",
  "resultsCounter": "{count} of {total} items",
  "filters": { "label": "Filter by:", "clearFilters": "Clear filters", "allContent": "All Content" },
  "emptyState": { "title": "No content found", "description": "...", "button": "Show all content" }
}
```

**Template placeholders:** Use `{placeholder}` syntax for dynamic values.

### course / resource

Content detail page text including labels, buttons, sidebar, metrics.

### errors / emptyStates / notFound

Error handling and empty state text.

### lessons

Lesson-related text with `{index}` placeholder.

## Usage Examples

### Get Text

```typescript
import { getCopy, getCopyObject } from '@/lib/copy'

// Simple text
const title = getCopy('site.title')

// With placeholder replacement
const counter = getCopy('contentLibrary.resultsCounter', { count: 5, total: 100 })
// Returns: "5 of 100 items"

// Get entire section as object
const heroButtons = getCopyObject('homepage.hero.buttons')
```

### useCopy Hook

```typescript
import { useCopy } from '@/lib/copy'

function MyComponent() {
  const { getCopy, site, navigation, homepage } = useCopy()

  return (
    <h1>{site.brandName}</h1>
  )
}
```

### Get Icons

```typescript
import {
  getNavigationIcon,
  getHomepageIcon,
  getProfileIcon,
  getStatusIcon,
  getActionIcon,
  getErrorIcon
} from '@/lib/copy-icons'

const BrandIcon = getNavigationIcon('brand')
const BadgeIcon = getHomepageIcon('badge')
const UserIcon = getProfileIcon('user')
const DraftIcon = getStatusIcon('draft')
const CopyIcon = getActionIcon('copy')
const ErrorIcon = getErrorIcon('notFound')
```

### Get All Icons

```typescript
import { getAllNavigationIcons, getAllProfileIcons } from '@/lib/copy-icons'

const navIcons = getAllNavigationIcons()
// { menu: MenuIcon, search: SearchIcon, ... }
```

## Configuration Recipes

### Custom Brand

```json
{
  "site": {
    "title": "My Academy - Learn Bitcoin",
    "brandName": "My Academy"
  },
  "icons": {
    "navigation": {
      "brand": "Bitcoin"
    }
  }
}
```

### Disable Animated Hero

```json
{
  "homepage": {
    "hero": {
      "title": {
        "useAnimated": false,
        "staticWord": "Bitcoin"
      }
    }
  }
}
```

### Custom Stats

```json
{
  "homepage": {
    "stats": {
      "students": { "value": "5,000+", "label": "Active Learners", "icon": "Users" },
      "courses": { "value": "50+", "label": "Courses Available", "icon": "BookOpen" },
      "hours": { "value": "200+", "label": "Hours of Content", "icon": "Clock" }
    }
  }
}
```

### Localization

All text is configurable. For localization:
1. Translate all text values in copy.json
2. Consider creating language-specific config files
3. Switch config at build time or runtime based on locale

## Related Documentation

- [config-system.md](../config-system.md) - Config system overview
- [components-architecture.md](../components-architecture.md) - Component patterns
