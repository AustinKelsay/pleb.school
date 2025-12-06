# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev          # Start development server with Turbopack
npm run build        # Build for production (includes prisma generate)
npm run start        # Start production server
npm run lint         # Run ESLint

# Database operations
npx prisma generate     # Generate Prisma client (after schema changes)
npx prisma db push      # Push schema changes to database
npm run db:seed         # Seed database with sample data

# Docker (alternative to local setup)
docker compose up db    # Start PostgreSQL only
docker compose up app   # Full stack

# Always verify before committing
npm run build && npm run lint
```

## Project Architecture

**Next.js 15** app with **React 19** using App Router. A developer education platform combining PostgreSQL with **Nostr protocol** for decentralized content management.

### Hybrid Data Architecture

The core architectural pattern: **Database stores metadata, Nostr stores content**.

- **PostgreSQL (Prisma)**: Users, purchases, progress, prices, relations, timestamps
- **Nostr Events**: Full content via NIP-23 (free) and NIP-99 (paid) events
- **Display Layer**: Parser functions merge both sources into unified UI interfaces

### Key NIPs Used
- **NIP-01**: Basic event structure
- **NIP-07**: Browser extension signing
- **NIP-19**: Bech32 encoding (npub, naddr)
- **NIP-23**: Long-form content (kind 30023)
- **NIP-51**: Lists/courses (kind 30004)
- **NIP-57**: Zaps (Lightning payments)
- **NIP-99**: Classified listings/paid content (kind 30402)

### Authentication System

Dual identity architecture in `src/lib/auth.ts`:

**Nostr-first** (NIP07, Anonymous): Nostr profile is source of truth, syncs on every login
**OAuth-first** (Email, GitHub): OAuth profile is authoritative, gets ephemeral Nostr keys for protocol access

All users get Nostr capabilities regardless of login method.

### Purchase System

All purchases are NIP-57 zaps with aggregation:
- User zaps accumulate toward content price
- When `viewerZapTotalSats >= price`, purchase is auto-claimed via `/api/purchases/claim`
- Check `usePurchaseEligibility` hook for purchase state
- Never create purchases directly; always use the claim API

### Key Files

| Area | File | Purpose |
|------|------|---------|
| Types | `src/data/types.ts` | Database models, Nostr types, Display interfaces, parsers |
| Data Access | `src/lib/db-adapter.ts` | Adapter pattern for all data operations |
| Auth | `src/lib/auth.ts` | NextAuth config with dual identity model |
| Nostr Events | `src/lib/nostr-events.ts` | Event builders (NIP-23/99/51) |
| Publishing | `src/lib/publish-service.ts` | Draft-to-Nostr publishing |
| Relays | `src/lib/nostr-relays.ts` | `getRelays(set)` for relay configuration |
| Pricing | `src/lib/pricing.ts` | `resolvePriceForContent()` for canonical prices |
| Caching | `src/lib/cache.ts` | Hierarchical L1/L2 cache with TTL |

### Config System

JSON files in `/config/` control behavior (see `config/README.md`):
- `auth.json` - Authentication providers and UI
- `theme.json` - Theme/font defaults and controls
- `content.json` - Content display, filters, search settings
- `copy.json` - All user-facing text
- `payments.json` - Zap presets, purchase UX
- `nostr.json` - Relay sets
- `admin.json` - Admin/moderator pubkeys

**Important**: Config files ship to client. Never put secrets here; use environment variables.

## Code Style

1. **Component Structure**:
   - Pages: `export default function PageName() {}`
   - Components: `export const ComponentName = () => {}`

2. **Data Access**: Always use adapters (`CourseAdapter`, `ResourceAdapter`, `LessonAdapter`). Never access database or mock data directly.

3. **Imports**: React/Next first, then third-party, then internal (`@/` alias)

4. **Naming**: PascalCase for components/contexts/hooks (prefix hooks with `use`), kebab-case for route directories

## Important Patterns

### Smart Image Handling
Use `OptimizedImage` component for images from any domain. It auto-handles unknown domains with `unoptimized` prop. Don't add domains to `next.config.ts`.

### Content Routing
Route by content type, not UI variant:
```typescript
if (item.type === 'course') router.push(`/courses/${item.id}`)
else router.push(`/content/${item.id}`)
```

### Nostr Event Parsing
Always use parser functions from `src/data/types.ts`:
- `parseCourseEvent()` - NIP-51 course lists
- `parseEvent()` - NIP-23/99 content events
- `createCourseDisplay()` / `createResourceDisplay()` - merge DB + Nostr

## ESLint

Flat config in `eslint.config.mjs`:
- Extends `next/core-web-vitals` and `next/typescript`
- **Disabled**: `no-unused-vars`, `no-explicit-any`
- **React Hooks**: `rules-of-hooks` (error), `exhaustive-deps` (warn)

## Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_SECRET` - JWT encryption secret
- `NEXTAUTH_URL` - App URL (e.g., http://localhost:3000)

**Optional:**
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `GITHUB_LINK_CLIENT_ID`, `GITHUB_LINK_CLIENT_SECRET` - Account linking OAuth
- `EMAIL_SERVER_*`, `EMAIL_FROM` - Email magic links (Nodemailer)
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` - Vercel KV for view counters

## Common Pitfalls

1. **Don't bypass adapters** - Always use `CourseAdapter`, `ResourceAdapter`, etc.
2. **Don't add image domains** - Use `OptimizedImage` component instead
3. **Don't create purchases directly** - Use `/api/purchases/claim` API
4. **Don't assume zaps = purchases** - Purchases must be explicitly claimed
5. **Don't put secrets in config/** - Use environment variables
6. **Don't skip build/lint** - Always run before committing
