# Configuration System

JSON configuration files for customizing pleb.school behavior without code changes. Located in `/config/`.

## Overview

Configuration is split into focused JSON files, each with a dedicated TypeScript accessor.

| File | Purpose | Accessor |
|------|---------|----------|
| `auth.json` | Auth providers, UI settings | `authConfig` import |
| `content.json` | Content types, icons, filters | `src/lib/content-config.ts` |
| `copy.json` | User-facing text, icons | `src/lib/copy.ts` |
| `theme.json` | Theme, font defaults | `src/lib/theme-config.ts` |
| `payments.json` | Zap presets, purchase UX | `src/lib/payments-config.ts` |
| `nostr.json` | Relay URLs by set | `src/lib/nostr-relays.ts` |
| `admin.json` | Admin pubkeys | `src/lib/admin-utils.ts` |

**Important**: Config files ship to the client. Never put secrets here.

## auth.json

Authentication providers and UI settings.

```json
{
  "providers": {
    "email": {
      "enabled": true,
      "maxAge": 3600
    },
    "github": {
      "enabled": true
    },
    "nostr": {
      "enabled": true
    },
    "anonymous": {
      "enabled": true,
      "usernamePrefix": "anon_",
      "usernameLength": 8,
      "defaultAvatar": "https://api.dicebear.com/7.x/shapes/svg?seed="
    }
  },
  "ui": {
    "showProviderIcons": true,
    "allowAccountLinking": true
  },
  "icons": {
    "providers": {
      "email": "Mail",
      "github": "Github",
      "nostr": "Zap",
      "anonymous": "UserX"
    }
  }
}
```

## content.json

Content types, categories, and display settings.

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
      "nostr": "Rss"
    }
  },
  "filters": {
    "showFreeOnly": true,
    "showPaidOnly": true,
    "defaultSort": "newest"
  },
  "search": {
    "minLength": 3,
    "debounceMs": 300
  }
}
```

## copy.json

All user-facing text and navigation icons.

```json
{
  "brand": {
    "name": "pleb.school",
    "tagline": "Learn Bitcoin Development"
  },
  "navigation": {
    "home": "Home",
    "courses": "Courses",
    "content": "Content",
    "profile": "Profile"
  },
  "icons": {
    "navigation": {
      "menu": "Menu",
      "search": "Search",
      "settings": "Settings",
      "profile": "UserCircle"
    },
    "homepage": {
      "badge": "Sparkles",
      "startLearning": "BookOpen"
    }
  }
}
```

## theme.json

Theme defaults and font settings.

```json
{
  "defaultTheme": "system",
  "defaultFont": "mono",
  "fontFamilies": {
    "mono": "'Geist Mono', monospace",
    "sans": "'Geist Sans', sans-serif"
  },
  "controls": {
    "showThemeToggle": true,
    "showFontToggle": true
  }
}
```

## payments.json

Zap and purchase configuration.

```json
{
  "zap": {
    "quickAmounts": [21, 100, 500, 1000, 2100],
    "defaultQuickIndex": 0,
    "noteMaxBytes": 280,
    "autoShowQr": false,
    "recentZapsLimit": 5
  },
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
    }
  },
  "purchase": {
    "showReceipt": true,
    "enablePrivacyMode": true
  }
}
```

## nostr.json

Relay URLs organized by use case.

```json
{
  "relaySets": {
    "default": [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.nostr.band"
    ],
    "content": [
      "wss://nos.lol",
      "wss://relay.nostr.band"
    ],
    "profile": [
      "wss://relay.nostr.band",
      "wss://nos.lol",
      "wss://relay.damus.io"
    ],
    "zapThreads": [
      "wss://nos.lol",
      "wss://relay.damus.io"
    ]
  }
}
```

## admin.json

Admin pubkeys for moderation.

```json
{
  "admins": [
    "f33c8a9674c6b59dd87e89a69a07b93c09a5e7d1a4..."
  ],
  "moderators": []
}
```

## TypeScript Accessors

### Content Config

```typescript
// src/lib/content-config.ts
import { getContentTypeIcon, getCategoryIcon } from '@/lib/content-config'

const VideoIcon = getContentTypeIcon('video')   // Returns LucideIcon
const BitcoinIcon = getCategoryIcon('bitcoin')
```

### Copy Text

```typescript
// src/lib/copy.ts
import { getCopy, getBrandName } from '@/lib/copy'

const homeText = getCopy('navigation.home')
const brandName = getBrandName()
```

### Payment Config

```typescript
// src/lib/payments-config.ts
import { paymentsConfig, getInteractionIcon } from '@/lib/payments-config'

const quickAmounts = paymentsConfig.zap.quickAmounts
const ZapIcon = getInteractionIcon('zap')
```

### Relays

```typescript
// src/lib/nostr-relays.ts
import { getRelays } from '@/lib/nostr-relays'

const relays = getRelays('content')  // Returns string[]
const defaultRelays = getRelays('default')
```

### Theme

```typescript
// src/lib/theme-config.ts
import { themeConfig, getDefaultFont } from '@/lib/theme-config'

const defaultTheme = themeConfig.defaultTheme
const fontFamily = getDefaultFont()
```

## Icon Resolution

Icons are resolved from string names to Lucide components:

```typescript
// src/lib/icons-config.ts
import { getIcon } from '@/lib/icons-config'

// Resolves "BookOpen" string to BookOpen component
const Icon = getIcon('BookOpen', 'HelpCircle')  // Fallback if not found
```

See [icon-system.md](../implementation/icon-system.md) for full details.

## Best Practices

1. **No secrets**: Config ships to client
2. **Defaults**: Always provide sensible defaults
3. **Validation**: Validate at runtime
4. **Comments**: Use `_comments` key for documentation
5. **Types**: Match TypeScript interfaces

## Adding New Config

1. Create `/config/newconfig.json`
2. Create accessor in `/src/lib/newconfig.ts`
3. Add TypeScript types
4. Update this documentation

## Related Documentation

- [icon-system.md](../implementation/icon-system.md) - Icon configuration
- [theme-configuration.md](./theme-configuration.md) - Theme details
