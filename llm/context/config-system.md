# Configuration System

JSON configuration files for customizing pleb.school behavior without code changes. Located in `/config/`.

## Overview

Configuration is split into focused JSON files, each with a dedicated TypeScript accessor. All config files ship to the client - **never store secrets here**.

| File | Purpose | Accessor |
|------|---------|----------|
| `auth.json` | Auth providers, session, UI settings, copy | Direct import + `src/lib/auth-icons.ts` |
| `content.json` | Homepage sections, filters, search, icons | `src/lib/content-config.ts` |
| `copy.json` | All user-facing text, navigation icons | `src/lib/copy.ts` + `src/lib/copy-icons.ts` |
| `theme.json` | Theme/font visibility, defaults | `src/lib/theme-ui-config.ts` |
| `payments.json` | Zap presets, purchase UX, icons | `src/lib/payments-config.ts` |
| `nostr.json` | Relay sets, event types, features | `src/lib/nostr-relays.ts` |
| `admin.json` | Admin/moderator pubkeys, permissions | `src/lib/admin-utils.ts` |

## File Structure Pattern

Each config file follows this pattern:

```json
{
  "icons": { ... },           // Icon configuration (PascalCase lucide-react names)
  "...config sections...": {},
  "_comments": { ... },       // Human-readable documentation (ignored at runtime)
  "_examples": { ... }        // Example configurations (ignored at runtime)
}
```

## Quick Reference

### auth.json

Controls authentication providers and sign-in UI.

**Key Sections:**
- `providers.*` - Enable/disable email, GitHub, Nostr, anonymous, recovery
- `session.*` - JWT strategy, max age, update interval
- `security.*` - Email verification, signup toggle, redirects
- `pages.*` - Custom auth page URLs
- `features.*` - UI toggles (provider visibility, layout options)
- `copy.*` - All sign-in page text
- `icons.*` - Provider and security icons

**Accessor:**
```typescript
import authConfig from '../../config/auth.json'
import { getProviderIcon, getSecurityIcon } from '@/lib/auth-icons'

// Check if provider is enabled
const nostrEnabled = authConfig.providers.nostr.enabled

// Get provider icon
const NostrIcon = getProviderIcon('nostr')
```

### content.json

Controls homepage content sections and content library behavior.

**Key Sections:**
- `homepage.sections.*` - Configure courses/videos/documents sections
- `homepage.sectionOrder` - Display order of sections
- `contentPage.filters` - Default view, pagination, search/filter toggles
- `contentPage.includeLessonResources` - Show lesson resources on /content
- `contentPage.imageFetch` - Relay set and concurrency for image fetching
- `search.*` - Nostr search configuration (timeout, limit, minKeywordLength)
- `global.categories` - Master category list
- `icons.*` - Content type and category icons

**Accessor:**
```typescript
import {
  getContentConfig,
  getEnabledHomepageSections,
  getContentTypeIcon,
  getCategoryIcon
} from '@/lib/content-config'

const config = getContentConfig()
const enabledSections = getEnabledHomepageSections()
const CourseIcon = getContentTypeIcon('course')
```

### copy.json

All user-facing text centralized for customization and localization.

**Key Sections:**
- `site.*` - Brand name, title, description
- `navigation.*` - Menu items, buttons, accessibility labels
- `homepage.*` - Hero, stats, visual elements, CTA
- `search.*` - Search page text
- `about.*` - About page content
- `subscribe.*`, `feeds.*` - Coming soon pages
- `contentLibrary.*` - Content page text
- `course.*`, `resource.*` - Content detail pages
- `payments.*` - Purchase/zap dialog text
- `icons.*` - Navigation, homepage, profile, status, action icons

**Accessor:**
```typescript
import { getCopy, useCopy, copyConfig } from '@/lib/copy'
import { getNavigationIcon, getHomepageIcon } from '@/lib/copy-icons'

// Get text with placeholders
const resultText = getCopy('contentLibrary.resultsCounter', { count: 5, total: 100 })

// Get icon
const BrandIcon = getNavigationIcon('brand')
```

### theme.json

Controls theme and font selector visibility and defaults.

**Key Sections:**
- `ui.showThemeSelector` - Show/hide theme dropdown
- `ui.showFontToggle` - Show/hide font selector
- `ui.showThemeToggle` - Show/hide dark/light toggle
- `defaults.theme` - Default theme (null = user choice)
- `defaults.font` - Default font (null = theme default)
- `defaults.darkMode` - Default mode (null = system)

**Accessor:**
```typescript
import {
  shouldShowThemeSelector,
  shouldShowFontToggle,
  getDefaultTheme
} from '@/lib/theme-ui-config'

const showSelector = shouldShowThemeSelector()
const defaultTheme = getDefaultTheme() // e.g., "cosmic-night"
```

**Priority:** User localStorage > defaults.* > system defaults

### payments.json

Controls zap presets and purchase dialog behavior.

**Key Sections:**
- `zap.quickAmounts` - Preset zap buttons (array of sats)
- `zap.defaultQuickIndex` - Which preset is selected by default
- `zap.minCustomZap` - Minimum for custom zap input
- `zap.noteMaxBytes` - Max bytes for zap notes
- `zap.privacyToggle` - Privacy toggle visibility rules
- `zap.autoShowQr` - Auto-reveal QR code
- `purchase.minZap` - Minimum zap for purchases
- `purchase.autoCloseMs` - Auto-close delay after success
- `purchase.progressBasis` - `"server"` or `"serverPlusViewer"`
- `icons.*` - Interaction and status icons

**Accessor:**
```typescript
import { paymentsConfig, getInteractionIcon } from '@/lib/payments-config'

const quickAmounts = paymentsConfig.zap.quickAmounts
const ZapIcon = getInteractionIcon('zap')
```

### nostr.json

Controls relay configuration and Nostr protocol settings.

**Key Sections:**
- `relays.default` - Primary relay list
- `relays.zapThreads` - Relays for ZapThreads widget
- `relays.custom` - User-defined additional relays
- `eventTypes.*` - NIP documentation (informational)
- `publishingDefaults.*` - Client tags, timeout (advisory)
- `features.*` - Feature flags (advisory, not all wired)

**Accessor:**
```typescript
import { getRelays, DEFAULT_RELAYS } from '@/lib/nostr-relays'

const contentRelays = getRelays('content')  // Falls back to 'default' if empty
const defaultRelays = DEFAULT_RELAYS
```

**Relay Set Fallback:** If a relay set is empty or missing, `getRelays()` falls back to `default`.

### admin.json

Controls admin and moderator access via Nostr pubkeys.

**Key Sections:**
- `admins.pubkeys` - Array of admin pubkeys (npub or hex)
- `admins.permissions` - Admin permission flags
- `moderators.pubkeys` - Array of moderator pubkeys
- `moderators.permissions` - Moderator permission flags
- `features.*` - Admin system features (advisory)

**Accessor:**
```typescript
import { getAdminInfo, isAdmin, hasPermission, adminConfig } from '@/lib/admin-utils'

// Check if session user is admin
const isUserAdmin = await isAdmin(session)

// Get full admin info
const adminInfo = await getAdminInfo(session)
// Returns: { isAdmin, isModerator, level, permissions, source }

// Check specific permission
const canCreate = await hasPermission(session, 'createCourse')
```

**Dual Detection:** Admins are detected by both database `Role.admin` field and config pubkey lists.

## Icon System

All icons are configured as PascalCase lucide-react names (e.g., `"BookOpen"`, `"Zap"`).

### Icon Configuration Locations

| Config File | Icon Categories |
|-------------|-----------------|
| `auth.json` | `providers`, `security`, `account` |
| `content.json` | `contentTypes`, `categories` |
| `copy.json` | `navigation`, `homepage`, `about`, `profile`, `status`, `actions`, `error`, `subscribe`, `feeds`, `course` |
| `payments.json` | `interactions`, `status`, `purchase` |

### Icon Resolution

```typescript
import { getIcon, validateIconName } from '@/lib/icons-config'

// Get icon with fallback
const Icon = getIcon('BookOpen', 'HelpCircle')

// Validate icon name
const isValid = validateIconName('InvalidIcon') // false
```

**Fallback Behavior:**
1. Try primary icon name
2. Try fallback icon if provided
3. Fall back to `HelpCircle`
4. Console warning in development for invalid names

## Adding New Configuration

1. Create `/config/newconfig.json` with `_comments` section
2. Create accessor in `/src/lib/newconfig.ts`
3. Add TypeScript interfaces
4. Update this documentation

## Environment Variables vs Config

Use config files for:
- UI customization
- Feature toggles
- Default values
- Text/copy

Use environment variables for:
- API keys and secrets
- Database URLs
- OAuth credentials
- Encryption keys

## Related Documentation

- [auth-config.md](./config/auth-config.md) - Auth configuration deep dive
- [content-config.md](./config/content-config.md) - Content configuration deep dive
- [copy-config.md](./config/copy-config.md) - Copy configuration deep dive
- [theme-configuration.md](./theme-configuration.md) - Theme system architecture
- [payments-config.md](./config/payments-config.md) - Payments configuration deep dive
- [nostr-config.md](./config/nostr-config.md) - Nostr configuration deep dive
- [admin-config.md](./config/admin-config.md) - Admin configuration deep dive
- [icon-system.md](../implementation/icon-system.md) - Icon implementation details
