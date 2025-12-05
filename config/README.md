# Configuration Files

Configuration JSON files that control behavior, appearance, and integrations. Each file contains a `_comments` section with inline documentation (keeps JSON valid — no `//` comments).

Tip: These files are bundled client-side. Never put secrets here; use environment variables for secrets.

## Files Overview

### 🔐 `auth.json` — Authentication
Providers (email, GitHub, Nostr, anonymous, recovery), session/redirect settings, UI toggles, and signin copy.

- Providers
  - `email.enabled` toggles magic links; uses Nodemailer envs: `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_SERVER_SECURE`, `EMAIL_FROM`.
  - `github.enabled` toggles OAuth; set `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`. For linking, create a second OAuth app and set `GITHUB_LINK_CLIENT_ID`/`GITHUB_LINK_CLIENT_SECRET` with callback `/api/account/oauth-callback`.
  - `nostr.enabled` toggles NIP‑07 extension login; `autoCreateUser` controls first‑sign‑in account creation.
  - `anonymous.enabled` allows ephemeral, platform‑custodied keys. (We no longer auto‑fill lud16/nip05.)
  - `recovery.enabled` enables private‑key recovery (hex or nsec).
- Security/pages/features/copy: control redirects, page routes, UX toggles, and all signin text.

Example (GitHub+Nostr only):
```json
{ "providers": { "email": { "enabled": false }, "github": { "enabled": true }, "nostr": { "enabled": true } } }
```

### 🎨 `theme.json` — Theme & Font
Header control visibility and defaults for color theme, font, and dark mode.

- `ui.showThemeSelector|showFontToggle|showThemeToggle` hide or show controls.
- `defaults.theme|font|darkMode` set initial selections (not hard locks). To lock, hide the corresponding control.
- Priority: user localStorage (if present) > defaults.* > library/system defaults.

Example (dark + clean‑slate):
```json
{ "defaults": { "theme": "clean-slate", "darkMode": true } }
```

### 📝 `content.json` — Content Display
Homepage sections (courses, videos, documents), filters (price/category/sort), pagination and search options, and global labels (categories, sort/price labels).
- `contentPage.includeLessonResources.{videos,documents}` lets you keep lesson-linked resources discoverable on `/content` while leaving homepage carousels untouched. Defaults to `true` for both so lessons don't disappear from the library once added to a course.
- `contentPage.imageFetch.{relaySet,maxConcurrentFetches}` sets which relay set to use for note preview images on `/content` and caps concurrent fetches to avoid flooding relays.

### 🔤 `copy.json` — Site Copy & Text
All user‑facing strings for navigation, homepage, about page, content pages, error/empty states, cards, and lessons.

- `site.*` controls global title/description/brand name.
- `homepage.*` powers the landing page hero, stats, sections, and CTA.
- `homepage.hero.title.useAnimated` toggles the rotating hero keywords; when `false`, the title uses `homepage.hero.title.staticWord` (or the first `animatedWords` entry) as a static label.
- `search.*` drives search page title/description, input placeholder, tab labels, summary, and empty/error messages.
- `verifyEmail.*` covers the email verification page titles, labels, button text, and errors.
- `about.steps.*` fills the three “make it yours” step cards.
- `payments.purchaseDialog` and `payments.zapDialog` hold toasts/status text for Lightning payments and zaps.
- `about.*` powers the About page hero, three feature pillars, and the “make it your own” CTA. This is the place to explain how your forked platform works (who it’s for, how Nostr/Lightning are used, and how to configure the stack) without touching React components.

### 💸 `payments.json` — Payments & Zap UX
Zap presets, minimums, privacy toggle behavior, note byte limits, zap QR auto-show (`zap.autoShowQr`), recent zap list size, purchase min zap, auto-close timing, purchase QR auto-show, and progress basis (`server` vs `serverPlusViewer`). Client-safe; no secrets.

### ⚡ `nostr.json` — Nostr Relays & NIPs
Relay sets and event type mapping. Relay access flows through `getRelays(set)`; `default` is used as the fallback when a set is empty or missing.

- Relay sets: `default`, `content` (optional), `profile` (optional), `zapThreads` (new), `custom`.
- Runtime: `src/lib/nostr-relays.ts` provides `getRelays(set)` and `DEFAULT_RELAYS`.
- Fetch/publish services that accept `relaySet` can use these names; otherwise they fall back to `default`.
- ZapThreads widget prefers the `zapThreads` set when present; otherwise it falls back to `default`.

### 🛡️ `admin.json` — Admin & Moderator
Pubkey lists (npub or hex) and permission flags. `features.*` are advisory until wired; admin-utils reads admins/moderators and normalizes keys.

## Priority & Overrides

- Auth: config is authoritative for which providers/UI are visible.
- Theme: localStorage > defaults.* > system (see theme.json comments).
- Nostr: explicit `relays[]` in API calls override; otherwise `relaySet` → config; otherwise falls back to `default`.

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
const relays = getRelays('default') // from config/nostr.json
```

## Environment Notes

- Email: requires Nodemailer envs listed above.
- GitHub: one OAuth app for sign‑in (`/api/auth/callback/github`) and a second for linking (`/api/account/oauth-callback`).
- Docker dev: Compose runs `prisma db push --accept-data-loss` on startup (development‑only convenience).

## Security

- These JSON files are shipped to the client; do not store secrets here.
- Use environment variables for credentials and secrets.
