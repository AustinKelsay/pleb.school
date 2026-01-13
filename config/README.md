# Configuration Files

Configuration JSON files that control behavior, appearance, and integrations. Each file contains a `_comments` section with inline documentation (keeps JSON valid).

**Important:** These files are bundled client-side. Never put secrets here; use environment variables for secrets.

## Files Overview

### `auth.json` — Authentication

Providers (email, GitHub, Nostr, anonymous, recovery), session/redirect settings, UI toggles, and signin copy.

- Providers
  - `email.enabled` toggles magic links; uses Nodemailer envs: `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_SERVER_SECURE`, `EMAIL_FROM`.
  - `github.enabled` toggles OAuth; set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`. For linking, create a second OAuth app and set `GITHUB_LINK_CLIENT_ID`/`GITHUB_LINK_CLIENT_SECRET` with callback `/api/account/oauth-callback`.
  - `nostr.enabled` toggles NIP-07 extension login; `autoCreateUser` controls first-sign-in account creation.
  - `anonymous.enabled` allows ephemeral, platform-custodied keys.
  - `recovery.enabled` enables private-key recovery (hex or nsec).
- Security/pages/features/copy: control redirects, page routes, UX toggles, and all signin text.

Example (GitHub+Nostr only):
```json
{ "providers": { "email": { "enabled": false }, "github": { "enabled": true }, "nostr": { "enabled": true } } }
```

### `theme.json` — Theme & Font

Header control visibility and defaults for color theme, font, and dark mode.

- `ui.showThemeSelector|showFontToggle|showThemeToggle` hide or show controls.
- `defaults.theme|font|darkMode` set initial selections (not hard locks). To lock, hide the corresponding control.
- Priority: user localStorage (if present) > defaults.* > library/system defaults.

Example (dark + clean-slate):
```json
{ "defaults": { "theme": "clean-slate", "darkMode": true } }
```

### `content.json` — Content Display

Homepage sections (courses, videos, documents), filters (price/category/sort), pagination and search options, and global labels (categories, sort/price labels).

- `contentPage.includeLessonResources.{videos,documents}` lets you keep lesson-linked resources discoverable on `/content` while leaving homepage carousels untouched.
- `contentPage.imageFetch.{relaySet,maxConcurrentFetches}` sets which relay set to use for note preview images on `/content`.
- `search.{minKeywordLength,timeout,limit,relaySet}` configures Nostr search behavior.
- **Search filters by admin pubkeys**: Content is discovered by querying Nostr for events authored by pubkeys listed in `admin.json`.

### `copy.json` — Site Copy & Text

All user-facing strings for navigation, homepage, about page, content pages, error/empty states, cards, and lessons.

- `site.*` controls global title/description/brand name.
- `homepage.*` powers the landing page hero, stats, sections, and CTA.
- `homepage.hero.title.useAnimated` toggles the rotating hero keywords.
- `search.*` drives search page title/description, input placeholder, tab labels, summary, and empty/error messages.
- `about.*` powers the About page hero, feature sections, and CTA.
- `payments.purchaseDialog` and `payments.zapDialog` hold toasts/status text for Lightning payments.

### `payments.json` — Payments & Zap UX

Zap presets, minimums, privacy toggle behavior, note byte limits, zap QR auto-show, recent zap list size, purchase min zap, auto-close timing, purchase QR auto-show, and progress basis.

- `zap.quickAmounts` - preset zap buttons in sats
- `zap.autoShowQr` - auto-reveal QR when invoice created
- `purchase.progressBasis` - `"server"` (confirmed only) or `"serverPlusViewer"` (include pending)

### `nostr.json` — Nostr Relays & NIPs

Relay sets and event type mapping. Relay access flows through `getRelays(set)`; `default` is used as the fallback when a set is empty or missing.

- Relay sets: `default`, `content` (optional), `profile` (optional), `zapThreads`, `custom`.
- Runtime: `src/lib/nostr-relays.ts` provides `getRelays(set)` and `DEFAULT_RELAYS`.
- ZapThreads widget prefers the `zapThreads` set when present; otherwise it falls back to `default`.

### `admin.json` — Admin & Moderator

Pubkey lists (npub or hex) and permission flags.

- `admins.pubkeys` - full admin access
- `moderators.pubkeys` - limited moderation access
- Both formats (npub and hex) are compared during checks
- **Search restriction**: Only content authored by admin/moderator pubkeys appears in search results

## Icon Configuration

Icons throughout the platform are configurable via [lucide-react](https://lucide.dev/icons/). Each config file contains an `icons` section for its relevant UI elements.

### Where icons are configured

| Config File | Icon Categories |
|-------------|-----------------|
| `content.json` | Content type icons (course, video, document), category icons |
| `copy.json` | Navigation, homepage, profile tabs, status, actions, error pages |
| `auth.json` | Provider icons (email, github, nostr, etc.), security icons |
| `payments.json` | Interaction icons (zap, heart, comment), payment status icons |

### Icon naming

Icon names must match **lucide-react component names exactly** (PascalCase):
- `BookOpen` (correct)
- `book-open` (incorrect - kebab-case)
- `bookopen` (incorrect - lowercase)

Browse all available icons at: https://lucide.dev/icons/

### Usage in code

```ts
// Content icons
import { getContentTypeIcon, getCategoryIcon } from '@/lib/content-config'
const CourseIcon = getContentTypeIcon('course')

// Navigation/UI icons
import { getNavigationIcon, getStatusIcon } from '@/lib/copy-icons'
const MenuIcon = getNavigationIcon('menu')

// Auth icons
import { getProviderIcon } from '@/lib/auth-icons'
const EmailIcon = getProviderIcon('email')

// Payment/interaction icons
import { getInteractionIcon } from '@/lib/payments-config'
const ZapIcon = getInteractionIcon('zap')
```

## Priority & Overrides

- Auth: config is authoritative for which providers/UI are visible.
- Theme: localStorage > defaults.* > system (see theme.json comments).
- Nostr: explicit `relays[]` in API calls override; otherwise `relaySet` -> config; otherwise falls back to `default`.

## Usage in Code

```ts
// Config imports
import authConfig from '../config/auth.json'
import themeConfig from '../config/theme.json'
import contentConfig from '../config/content.json'
import copyConfig from '../config/copy.json'
import { getRelays, DEFAULT_RELAYS } from '@/lib/nostr-relays'

// Examples
const emailEnabled = authConfig.providers.email.enabled
const showThemeSelector = themeConfig.ui.showThemeSelector
const relays = getRelays('default')
```

## Environment Notes

- Email: requires Nodemailer envs listed above.
- GitHub: one OAuth app for sign-in (`/api/auth/callback/github`) and a second for linking (`/api/account/oauth-callback`).
- Docker dev: Compose runs `prisma db push --accept-data-loss` on startup (development-only convenience).

## Security

- These JSON files are shipped to the client; do not store secrets here.
- Use environment variables for credentials and secrets.

## Detailed Documentation

For in-depth documentation on each config file, see:

- [llm/context/config-system.md](../llm/context/config-system.md) - Master config reference
- [llm/context/config/](../llm/context/config/) - Deep-dive docs for each config file
- [llm/context/theme-configuration.md](../llm/context/theme-configuration.md) - Theme system architecture
