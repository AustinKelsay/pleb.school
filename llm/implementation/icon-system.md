# Icon System Implementation

This document describes the complete icon configuration architecture and usage patterns across the pleb.school codebase.

---

## Architecture Overview

The icon system follows a **config-driven architecture** where icons are defined as strings in JSON config files and resolved to React components at runtime.

### Resolution Flow

```
JSON Config (string name)
    ↓
Getter Function (getNavigationIcon, getCourseIcon, etc.)
    ↓
getIcon(iconName, fallback) in icons-config.ts
    ↓
Cache check (iconCache Map)
    ↓
LucideIcons[iconName] lookup
    ↓
Validation (is function or React component?)
    ↓
Cache store + return LucideIcon
    ↓
Component renders: <Icon className="..." />
```

### Core Files

| File | Purpose |
|------|---------|
| `src/lib/icons-config.ts` | Core icon resolution, caching, validation utilities |
| `src/lib/copy-icons.ts` | Getters for `config/copy.json` icons (navigation, homepage, status, etc.) |
| `src/lib/auth-icons.ts` | Getters for `config/auth.json` icons (providers, security, account) |
| `src/lib/content-config.ts` | Getters for `config/content.json` icons (content types, categories) |
| `src/lib/payments-config.ts` | Getters for `config/payments.json` icons (interactions) |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Module-level resolution | Performance: resolve once at import, not per-render |
| String-based config | JSON-friendly, separates content from logic |
| Icon cache | Avoids repeated object lookups in lucide-react exports |
| Semantic getters | Type-safe, discoverable, context-specific defaults |
| Fallback hierarchy | Graceful degradation; app never crashes on invalid icon |

---

## Configuration Files

### config/copy.json Icons

Contains icons for navigation, homepage, profile, status indicators, actions, errors, and page-specific UI.

```json
{
  "icons": {
    "navigation": {
      "menu": "Menu",
      "search": "Search",
      "settings": "Settings",
      "profile": "UserCircle",
      "logout": "LogOut",
      "home": "Home",
      "back": "ArrowLeft",
      "forward": "ArrowRight",
      "brand": "Zap",
      "create": "Plus"
    },
    "homepage": {
      "badge": "Sparkles",
      "startLearning": "BookOpen",
      "watchDemo": "Video",
      "ctaPrimary": "Sparkles",
      "ctaSecondary": "ExternalLink",
      "visualPrimary": "Eye",
      "visualSecondary": "Settings",
      "visualCenter": "Zap"
    },
    "about": {
      "creators": "GitFork",
      "platform": "Network",
      "learners": "Settings2"
    },
    "profile": {
      "user": "User",
      "activity": "Activity",
      "settings": "Settings",
      "accounts": "Link2",
      "content": "FileText",
      "analytics": "BarChart3"
    },
    "status": {
      "draft": "FileEdit",
      "edit": "Edit",
      "preview": "Eye",
      "share": "Share2",
      "publish": "Share"
    },
    "actions": {
      "copy": "Copy",
      "download": "Download",
      "externalLink": "ExternalLink",
      "info": "Info"
    },
    "error": {
      "notFound": "AlertCircle",
      "serverError": "AlertCircle",
      "refresh": "RefreshCw"
    },
    "subscribe": {
      "badge": "Sparkles",
      "signal": "BellRing",
      "creators": "NotebookPen",
      "perks": "Gift"
    },
    "feeds": {
      "sources": "Rss",
      "alerts": "BellRing",
      "adaptive": "Settings2"
    },
    "course": {
      "price": "DollarSign",
      "education": "GraduationCap"
    }
  }
}
```

### config/content.json Icons

Contains icons for content types and categories.

```json
{
  "icons": {
    "contentTypes": {
      "course": "BookOpen",
      "video": "Video",
      "document": "FileText"
    },
    "categories": {
      "bitcoin": "CircleDollarSign",
      "lightning": "Zap",
      "nostr": "Rss",
      "frontend": "Code",
      "backend": "Server",
      "mobile": "Smartphone",
      "security": "Shield",
      "web3": "Globe"
    }
  }
}
```

### config/auth.json Icons

Contains icons for authentication providers, security indicators, and account management.

```json
{
  "icons": {
    "providers": {
      "email": "Mail",
      "github": "Github",
      "nostr": "Zap",
      "anonymous": "UserX",
      "recovery": "KeyRound"
    },
    "security": {
      "shield": "Shield",
      "shieldCheck": "ShieldCheck",
      "key": "Key",
      "sparkles": "Sparkles",
      "help": "HelpCircle",
      "arrow": "ArrowRight",
      "chevronDown": "ChevronDown"
    },
    "account": {
      "link": "Link2",
      "unlink": "Unlink",
      "user": "User",
      "admin": "Crown",
      "loader": "Loader2"
    }
  }
}
```

### config/payments.json Icons

Contains icons for interaction metrics, payment status, and purchase UI.

```json
{
  "icons": {
    "interactions": {
      "zap": "Zap",
      "heart": "Heart",
      "comment": "MessageCircle"
    },
    "status": {
      "success": "CircleCheck",
      "pending": "Loader2",
      "error": "TriangleAlert"
    },
    "purchase": {
      "shieldCheck": "ShieldCheck",
      "wallet": "Wallet"
    }
  }
}
```

---

## Getter Functions Reference

### From copy-icons.ts

| Function | Keys | Default Fallback |
|----------|------|------------------|
| `getNavigationIcon(key)` | menu, search, settings, profile, logout, home, back, forward, brand, create | HelpCircle |
| `getHomepageIcon(key)` | badge, startLearning, watchDemo, ctaPrimary, ctaSecondary, visualPrimary, visualSecondary, visualCenter | Sparkles |
| `getAboutIcon(key)` | creators, platform, learners | Info |
| `getProfileIcon(key)` | user, activity, settings, accounts, content, analytics | User |
| `getStatusIcon(key)` | draft, edit, preview, share, publish | Info |
| `getActionIcon(key)` | copy, download, externalLink, info | MoreHorizontal |
| `getErrorIcon(key)` | notFound, serverError, refresh | AlertCircle |
| `getSubscribeIcon(key)` | badge, signal, creators, perks | Sparkles |
| `getFeedsIcon(key)` | sources, alerts, adaptive | Rss |
| `getCourseIcon(key)` | price, education | BookOpen |

Each category also has `getAll<Category>Icons()` returning `Record<string, LucideIcon>`.

### From auth-icons.ts

| Function | Keys | Default Fallback |
|----------|------|------------------|
| `getProviderIcon(provider)` | email, github, nostr, anonymous, recovery | User |
| `getSecurityIcon(key)` | shield, shieldCheck, key, sparkles, help, arrow, chevronDown | Shield |
| `getAccountIcon(key)` | link, unlink, user, admin, loader | User |

### From content-config.ts

| Function | Keys | Default Fallback |
|----------|------|------------------|
| `getContentTypeIcon(type)` | course, video, document | FileText |
| `getCategoryIcon(category)` | bitcoin, lightning, nostr, frontend, backend, mobile, security, web3 | Tag |

### From payments-config.ts

| Function | Keys | Default Fallback |
|----------|------|------------------|
| `getInteractionIcon(key)` | zap, heart, comment | Zap |
| `getPaymentStatusIcon(key)` | success, pending, error | Info |
| `getPurchaseIcon(key)` | shieldCheck, wallet | ShieldCheck |

### From icons-config.ts (Core Utilities)

| Function | Purpose |
|----------|---------|
| `getIcon(iconName, fallback?)` | Direct resolution of icon name to component |
| `getIconOrNull(iconName)` | Returns null if icon doesn't exist |
| `validateIconName(iconName)` | Boolean validation |
| `validateIconNames(names[])` | Batch validation, returns invalid names |
| `getIconConfigErrors(config, path)` | Validate entire config object |
| `getAvailableIconNames()` | List all 1000+ lucide icons |
| `createIconGetter(config, fallback)` | Factory for custom getters |

---

## Usage Patterns

### Module-Level Resolution (Recommended)

Icons are resolved **at module load time** and stored as constants. This is the recommended pattern.

```typescript
// src/components/layout/header.tsx
import { getNavigationIcon } from "@/lib/copy-icons"

// Resolved once at module load - NOT in render
const MenuIcon = getNavigationIcon('menu')
const SearchIcon = getNavigationIcon('search')
const BrandIcon = getNavigationIcon('brand')

export function Header() {
  return (
    <header>
      <MenuIcon className="h-6 w-6" />
      <SearchIcon className="h-4 w-4" />
      <BrandIcon className="h-4 w-4" />
    </header>
  )
}
```

**Why this pattern:**
- Icons resolve once, not on every render
- React can optimize these constants
- Declarative at top of file

### Component-Level Resolution

For error pages or components that don't need render optimization:

```typescript
// src/app/not-found.tsx
import { getErrorIcon, getNavigationIcon } from "@/lib/copy-icons"

export default function NotFound() {
  const NotFoundIcon = getErrorIcon('notFound')
  const HomeIcon = getNavigationIcon('home')

  return (
    <Card>
      <NotFoundIcon className="h-6 w-6" />
      <HomeIcon className="mr-2 h-4 w-4" />
    </Card>
  )
}
```

### Dynamic Resolution

For icons that depend on runtime data:

```typescript
import { getContentTypeIcon, getCategoryIcon } from "@/lib/content-config"

function ContentCard({ type, category }) {
  const TypeIcon = getContentTypeIcon(type)      // 'course', 'video', etc.
  const CategoryIcon = getCategoryIcon(category) // 'bitcoin', 'nostr', etc.

  return (
    <>
      <TypeIcon className="h-4 w-4" />
      <CategoryIcon className="h-4 w-4" />
    </>
  )
}
```

### Record-Based Mapping

For iterating over all icons in a category:

```typescript
import { getAllContentTypeIcons } from "@/lib/content-config"

const allIcons = getAllContentTypeIcons()
// Returns: { course: BookOpen, video: Video, document: FileText }

Object.entries(allIcons).map(([key, Icon]) => (
  <Icon key={key} className="h-4 w-4" />
))
```

---

## Configurable Icons Reference

### Navigation Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| menu | Menu | Mobile menu toggle |
| search | Search | Search icon |
| settings | Settings | Settings icon |
| profile | UserCircle | Profile link |
| logout | LogOut | Logout button |
| home | Home | Home link |
| back | ArrowLeft | Back navigation |
| forward | ArrowRight | Forward navigation |
| brand | Zap | Brand icon |
| create | Plus | Create button |

### Homepage Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| badge | Sparkles | Hero badge |
| startLearning | BookOpen | Start learning CTA |
| watchDemo | Video | Watch demo CTA |
| ctaPrimary | Sparkles | Primary CTA |
| ctaSecondary | ExternalLink | Secondary CTA |
| visualPrimary | Eye | Visual element |
| visualSecondary | Settings | Visual element |
| visualCenter | Zap | Visual element |

### About Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| creators | GitFork | Creators section |
| platform | Network | Platform section |
| learners | Settings2 | Learners section |

### Profile Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| user | User | User tab |
| activity | Activity | Activity tab |
| settings | Settings | Settings tab |
| accounts | Link2 | Accounts tab |
| content | FileText | Content tab |
| analytics | BarChart3 | Analytics tab |

### Status Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| draft | FileEdit | Draft status |
| edit | Edit | Edit status |
| preview | Eye | Preview status |
| share | Share2 | Share action |
| publish | Share | Publish action |

### Action Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| copy | Copy | Copy action |
| download | Download | Download action |
| externalLink | ExternalLink | External link |
| info | Info | Info tooltip |

### Error Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| notFound | AlertCircle | 404 error |
| serverError | AlertCircle | Server error |
| refresh | RefreshCw | Refresh action |

### Subscribe Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| badge | Sparkles | Subscribe badge |
| signal | BellRing | Signal highlight |
| creators | NotebookPen | Creators highlight |
| perks | Gift | Perks highlight |

### Feeds Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| sources | Rss | Sources highlight |
| alerts | BellRing | Alerts highlight |
| adaptive | Settings2 | Adaptive highlight |

### Course Icons (copy.json)
| Key | Icon | Usage |
|-----|------|-------|
| price | DollarSign | Price/cost indicators |
| education | GraduationCap | Course/lesson headers |

### Content Type Icons (content.json)
| Key | Icon | Usage |
|-----|------|-------|
| course | BookOpen | Course content type |
| video | Video | Video content type |
| document | FileText | Document content type |

### Category Icons (content.json)
| Key | Icon | Usage |
|-----|------|-------|
| bitcoin | CircleDollarSign | Bitcoin category |
| lightning | Zap | Lightning category |
| nostr | Rss | Nostr category |
| frontend | Code | Frontend category |
| backend | Server | Backend category |
| mobile | Smartphone | Mobile category |
| security | Shield | Security category |
| web3 | Globe | Web3 category |

### Provider Icons (auth.json)
| Key | Icon | Usage |
|-----|------|-------|
| email | Mail | Email provider |
| github | Github | GitHub provider |
| nostr | Zap | Nostr provider |
| anonymous | UserX | Anonymous provider |
| recovery | KeyRound | Recovery option |

### Security Icons (auth.json)
| Key | Icon | Usage |
|-----|------|-------|
| shield | Shield | Shield icon |
| shieldCheck | ShieldCheck | Verified shield |
| key | Key | Key icon |
| sparkles | Sparkles | Sparkles accent |
| help | HelpCircle | Help icon |
| arrow | ArrowRight | Arrow icon |
| chevronDown | ChevronDown | Chevron down |

### Account Icons (auth.json)
| Key | Icon | Usage |
|-----|------|-------|
| link | Link2 | Link account |
| unlink | Unlink | Unlink account |
| user | User | User icon |
| admin | Crown | Admin indicator |
| loader | Loader2 | Loading spinner |

### Interaction Icons (payments.json)
| Key | Icon | Usage |
|-----|------|-------|
| zap | Zap | Zap/lightning bolt |
| heart | Heart | Like/heart |
| comment | MessageCircle | Comment bubble |

### Payment Status Icons (payments.json)

| Key | Icon | Usage |
|-----|------|-------|
| success | CircleCheck | Success status |
| pending | Loader2 | Pending/in-progress |
| error | TriangleAlert | Error status |

### Purchase Icons (payments.json)

| Key | Icon | Usage |
|-----|------|-------|
| shieldCheck | ShieldCheck | Purchase security badge |
| wallet | Wallet | Wallet/payment badge |

---

## Non-Configurable Icons

These icons are currently hardcoded via direct `lucide-react` imports. They can be made configurable following the pattern in "Adding New Configurable Icons" below.

### Theme & UI Controls
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Moon | theme-toggle.tsx, header.tsx | `icons.theme.dark` |
| Sun | theme-toggle.tsx | `icons.theme.light` |
| Palette | theme-selector.tsx | `icons.theme.palette` |
| Type | font-toggle.tsx, header.tsx | `icons.theme.font` |
| Check | Multiple (selections) | `icons.ui.check` |
| ChevronDown | Multiple (dropdowns) | `icons.ui.chevronDown` |
| ChevronUp | Multiple (dropdowns) | `icons.ui.chevronUp` |
| ChevronRightIcon | dropdown-menu.tsx | `icons.ui.chevronRight` |
| X | Multiple (close buttons) | `icons.ui.close` |
| Circle | radio-group.tsx | `icons.ui.radioEmpty` |

### Loading & Status States
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Loader2 | Multiple (loading spinners) | `icons.status.loading` |
| CheckCircle | profile-edit-forms.tsx, enhanced-settings.tsx | `icons.status.success` |
| CheckCircle2 | purchase-list.tsx, course-draft-client.tsx | `icons.status.successAlt` |
| AlertTriangle | Multiple (warnings) | `icons.status.warning` |

### Authentication & Security
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| ShieldCheck | zap-dialog.tsx, purchase-dialog.tsx, content-card.tsx | `icons.auth.verified` |
| Crown | content/page.tsx, admin-badge.tsx | `icons.auth.admin` |
| KeyRound | signin/page.tsx | `icons.auth.key` |
| Key | linked-accounts.tsx, profile-display.tsx | `icons.auth.nostrKey` |
| UserX | signin/page.tsx | `icons.auth.anonymous` |
| Lock | purchase-dialog.tsx, content-card.tsx | `icons.auth.locked` |
| Unlock | purchase-dialog.tsx, content-card.tsx | `icons.auth.unlocked` |

### Video Player Controls
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Play | video-player.tsx, courses/[id]/page.tsx | `icons.video.play` |
| Pause | video-player.tsx | `icons.video.pause` |
| PlayCircle | lesson-draft-preview-client.tsx | `icons.video.playCircle` |
| Volume2 | video-player.tsx | `icons.video.volumeOn` |
| VolumeX | video-player.tsx | `icons.video.volumeOff` |
| Maximize | video-player.tsx | `icons.video.fullscreen` |
| Maximize2 | content/[id]/page.tsx | `icons.video.expand` |
| Minimize2 | content/[id]/page.tsx | `icons.video.collapse` |
| RotateCcw | lessons/[lessonId]/details/page.tsx | `icons.video.restart` |

### Content Metadata
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Clock | Multiple (duration displays) | `icons.metadata.duration` |
| Calendar | content-card.tsx, resource-content-view.tsx | `icons.metadata.date` |
| Tag | courses/[id]/page.tsx, content/[id]/page.tsx | `icons.metadata.tag` |

### User Actions
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Trash2 | drafts-client.tsx, admin-content-manager.tsx | `icons.actions.delete` |
| Filter | content/page.tsx, drafts-client.tsx | `icons.actions.filter` |
| Plus | lesson-selector.tsx, create-course-draft-form.tsx | `icons.actions.add` |
| Save | simple-settings.tsx, enhanced-settings.tsx | `icons.actions.save` |
| Pencil | course-draft-client.tsx, course-publish-client.tsx | `icons.actions.pencil` |
| QrCode | zap-dialog.tsx, purchase-dialog.tsx | `icons.actions.qrCode` |

### Social & Accounts
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| Mail | signin/page.tsx, linked-accounts.tsx | `icons.social.email` |
| Github | signin/page.tsx, linked-accounts.tsx | `icons.social.github` |
| GitBranch | enhanced-settings.tsx | `icons.social.gitBranch` |
| Twitter | profile-display.tsx | `icons.social.twitter` |
| MapPin | profile-display.tsx | `icons.social.location` |
| Heart | content-card.tsx, purchase-activity.tsx | `icons.social.like` |
| MessageCircle | zap-threads.tsx, content-card.tsx | `icons.social.comment` |
| MessageSquare | purchase-activity.tsx | `icons.social.message` |
| Users | content-card.tsx, search-result-card.tsx | `icons.social.users` |
| Wallet | admin-purchase-analytics.tsx | `icons.social.wallet` |
| Unlink | linked-accounts.tsx | `icons.social.unlink` |
| LinkIcon | linked-accounts.tsx | `icons.social.link` |

### Content Type Variants
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| FileCode | create-draft-form.tsx | `icons.contentTypes.code` |
| Map | create-draft-form.tsx | `icons.contentTypes.map` |
| ScrollText | create-draft-form.tsx | `icons.contentTypes.scroll` |
| Image | create-draft-form.tsx, create-course-draft-form.tsx | `icons.contentTypes.image` |
| ImageOff | lesson-selector.tsx | `icons.contentTypes.imageFallback` |
| Receipt | purchase-list.tsx | `icons.contentTypes.receipt` |

### Visibility & Error States
| Icon | Files Used | Suggested Config Key |
|------|-----------|---------------------|
| EyeOff | profile-display.tsx | `icons.visibility.hidden` |
| WifiOff | enhanced-settings.tsx | `icons.error.offline` |
| ServerCrash | enhanced-settings.tsx | `icons.error.serverDown` |
| HelpCircle | signin/page.tsx | `icons.error.help` |
| CircleHelp | info-tooltip.tsx | `icons.error.helpAlt` |

---

## Adding New Configurable Icons

Follow this pattern to make hardcoded icons configurable:

### Step 1: Add to Config JSON

Choose the appropriate config file and add the icon:

```json
// config/copy.json
{
  "icons": {
    "newCategory": {
      "iconKey": "LucideIconName"
    }
  },
  "_comments": {
    "icons.newCategory": "Description of this category",
    "icons.newCategory.iconKey": "Description of this specific icon"
  }
}
```

### Step 2: Add Getter Function

Add to the appropriate icons file (e.g., `copy-icons.ts`):

```typescript
// Update the interface
interface CopyIconsConfig {
  // ... existing
  newCategory: Record<string, string>
}

// Add getter functions
export function getNewCategoryIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.newCategory?.[key] || "DefaultIcon"
  return getIcon(iconName, "DefaultIcon")
}

export function getAllNewCategoryIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.newCategory || {})) {
    result[key] = getIcon(iconName, "DefaultIcon")
  }
  return result
}
```

### Step 3: Update Components

Replace hardcoded imports with configurable icons **at module level**:

```typescript
// Before
import { DollarSign } from 'lucide-react'

function Component() {
  return <DollarSign className="h-4 w-4" />
}

// After
import { getNewCategoryIcon } from '@/lib/copy-icons'

const PriceIcon = getNewCategoryIcon('price')  // Module level!

function Component() {
  return <PriceIcon className="h-4 w-4" />
}
```

### Step 4: Verify

```bash
npm run build && npm run lint
```

---

## Related Documentation

- [config-system.md](../context/config-system.md) - Config system overview
- [auth-config.md](../context/config/auth-config.md) - Auth icons configuration
- [content-config.md](../context/config/content-config.md) - Content type and category icons
- [copy-config.md](../context/config/copy-config.md) - Navigation and UI icons
- [payments-config.md](../context/config/payments-config.md) - Payment interaction icons

---

Last Updated: 2026-01-13
