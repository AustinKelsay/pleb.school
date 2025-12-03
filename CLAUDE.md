# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev          # Start development server with Turbopack
npm run build        # Build for production (includes prisma generate)
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push database schema changes
npm run db:seed      # Seed database with sample data

# Database operations (requires DATABASE_URL environment variable)
npx prisma generate     # Generate Prisma client
npx prisma db push      # Push schema changes to database
npx prisma migrate dev  # Create and apply new migration
npx prisma studio       # Open Prisma Studio for database browsing

# Docker development (alternative to local setup)
docker compose up db    # Start PostgreSQL only
docker compose up app   # Full stack (waits for Prisma sync)

# Verify changes before committing
npm run build && npm run lint
```

## Important Development Workflow

When making changes to this codebase:
1. **Always run linting**: Use `npm run lint` after making changes and fix any errors before committing
2. **Check build success**: Run `npm run build` to ensure no compilation errors
3. **Database Adapter Pattern**: Use adapters for all data access - never access data directly
4. **Type Safety**: Maintain strict TypeScript compliance with runtime Zod validation
5. **Database Changes**: Use `npx prisma generate` after schema changes, `npx prisma db push` for development

## ESLint Configuration

The project uses ESLint CLI (ESLint 9) with a customized flat config in `eslint.config.mjs`:
- Uses `FlatCompat` to convert Next.js ESLint configs to flat config format
- Extends `next/core-web-vitals` and `next/typescript` via compatibility layer
- **Disabled Rules**: `no-unused-vars`, `no-explicit-any`
- **React Hooks**: `rules-of-hooks` (error), `exhaustive-deps` (warn)

## Project Architecture

This is a **Next.js 15** application with **React 19** using the App Router pattern. The project demonstrates a sophisticated developer education platform with **hybrid data architecture** combining traditional databases with **Nostr protocol** for content management.

### Key Architectural Patterns

#### Hybrid Data Architecture
The project uses a unique **Database + Nostr Events** approach:
- **Minimal Database Fields**: Only essential data (ID, price, timestamps, relations) stored in PostgreSQL
- **Rich Content from Nostr**: Full content comes from NIP-23 (free) and NIP-99 (paid) events
- **Unified Display Layer**: Combines both sources for complete UI data via Display interfaces
- **Development Mode**: JSON mock files + real Nostr events for rapid development without database setup

#### Database Adapter Pattern
Clean data access abstraction in `src/lib/db-adapter.ts`:
- **CourseAdapter**: CRUD operations with JSON database simulation + Nostr event integration
- **ResourceAdapter**: Handles both documents and videos from JSON files + Nostr events
- **LessonAdapter**: Course-to-resource relationships with JSON persistence
- **Performance**: Built-in hierarchical caching for sub-50ms response times
- **IMPORTANT**: Always use adapters, never access mock data or database directly

#### Nostr Integration
Real-time content management through Nostr protocol:
- **SnstrProvider**: Context provider for relay pool management in `src/contexts/snstr-context.tsx`
- **Event Parsing**: Parser functions in `src/data/types.ts` convert Nostr events to UI data
- **Publishing System**: Complete draft-to-Nostr publishing flow with NIP-07 browser extension support
- **Atomic Operations**: All draft lessons published before course creation
- **Key NIPs Used**: NIP-01 (events), NIP-07 (browser signing), NIP-19 (bech32 encoding), NIP-23 (long-form content), NIP-51 (lists/courses), NIP-57 (zaps), NIP-99 (classified listings/paid content)

### Key Architectural Files

#### Data Management
- `src/data/types.ts` - **Complete type system**: Database models, Nostr event types, Display interfaces, and parser functions
- `src/lib/db-adapter.ts` - **Database adapter pattern**: Clean data abstraction with JSON mock + Nostr integration
- `src/data/mockDb/` - **JSON mock database**: Course.json, Resource.json, Lesson.json files for development
- `src/lib/cache.ts` - **Production caching**: Hierarchical L1/L2 cache with TTL and statistics

#### Authentication System
- `src/lib/auth.ts` - **Dual Identity Architecture**: 
  - **Nostr-first** (NIP07, Anonymous): Nostr profile is source of truth, syncs on every login
  - **OAuth-first** (Email, GitHub): OAuth profile is authoritative, gets ephemeral Nostr keys
- **5 Authentication Methods**: Email magic links, GitHub OAuth, NIP07 browser extension, Anonymous, Recovery mode
- **Universal Nostr Access**: All users get Nostr capabilities with appropriate key custody models

#### Publishing System
- `src/lib/nostr-events.ts` - **Event builders**: Create NIP-23/NIP-99/NIP-51 compliant events
- `src/lib/publish-service.ts` - **Publishing service**: Atomic operations for drafts to Nostr
- `src/lib/draft-service.ts` - **Draft management**: CourseDraftService, DraftService, DraftLessonService classes

#### Purchases & Sales System
- `src/lib/pricing.ts` - **Price resolution**: Canonical pricing for courses and resources
- `src/hooks/usePurchaseEligibility.ts` - **Purchase eligibility**: Auto-claim purchases when zap totals meet price
- `src/components/purchase/purchase-dialog.tsx` - **Purchase UI**: Complete purchase flow with zap integration
- `src/app/api/purchases/claim/route.ts` - **Purchase API**: Claim purchases via NIP-57 zaps
- **Payment Rail**: All purchases are NIP-57 zaps; aggregate zaps count toward price
- **Auto-claiming**: Purchases are automatically created when viewer zap totals reach price threshold
- **Privacy Options**: NIP-07 users can opt for anonymous zaps while maintaining purchase records

#### API Routes
- `/api/courses`, `/api/resources` - Content CRUD with validation
- `/api/drafts/courses`, `/api/drafts/resources` - Draft management
- `/api/drafts/*/publish` - Publishing endpoints (drafts to Nostr)
- `/api/purchases/claim` - Purchase claiming via zap aggregation
- `/api/profile/*` - Profile aggregation and sync
- `/api/account/*` - Account linking and OAuth callbacks
- **Error Handling**: Structured error classes (NotFoundError, ValidationError, etc.)
- **Validation**: Comprehensive Zod schemas matching TypeScript types

### Core Technologies
- **Next.js 15** with Turbopack and App Router
- **React 19** with Server Components
- **TypeScript** with strict mode
- **Tailwind CSS v4** with shadcn/ui
- **snstr** for Nostr protocol
- **Zod** for runtime validation
- **@tanstack/react-query** for data fetching
- **NextAuth.js 4** with Prisma adapter
- **Prisma** with PostgreSQL
- **Vercel KV** for view counters (hot path)

### Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Secret for JWT encryption
- `NEXTAUTH_URL` - Application URL (e.g., http://localhost:3000)

**Docker (when using docker-compose):**
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` - Database credentials

**Optional:**
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` - Vercel KV for view counters

## Code Style Guidelines

1. **Component Structure**:
   - Use function declarations for pages: `export default function PageName() {}`
   - Use arrow functions for components: `export const ComponentName = () => {}`

2. **Import Organization**:
   - React/Next imports first, then third-party, then internal (`@/` alias preferred)
   - Delete unused imports even if linting permits

3. **Data Access**:
   - ALWAYS use adapters (CourseAdapter, ResourceAdapter, etc.)
   - NEVER access mock data or database directly

4. **Naming**: Components/contexts/hooks use PascalCase (hooks prefixed with `use`), route directories use kebab-case

## Smart Image Optimization
- **OptimizedImage Component**: Automatically handles images from any domain without manual configuration
- **Seamless Fallback**: Uses `unoptimized` prop for unknown domains
- **Pre-configured Domains**: Unsplash, GitHub avatars, YouTube thumbnails, DiceBear, DigitalOcean Spaces

## Git Workflow

- **Always run**: `npm run lint` and `npm run build` before committing
- **Database changes**: Run `npx prisma generate` after schema changes
- **Commit style**: Short, imperative, lowercase subjects (e.g., `add feature`, `fix bug`)

## Purchase & Sales Implementation Details

### Payment Architecture
The platform uses **NIP-57 zaps as the sole payment rail** with intelligent aggregation:

1. **Zap Aggregation**: User's zaps for a piece of content sum toward the sticker price
2. **Auto-claiming**: When `viewerZapTotalSats >= priceSats`, purchase is automatically created
3. **Privacy-First**: NIP-07 users can opt for anonymous zaps while maintaining purchase records
4. **Non-authenticated Zaps**: Logged-out users can send zaps (tips only), but purchase claiming requires sign-in

### Purchase Schema Fields
The `Purchase` model includes:
- `userId`, `courseId`, `resourceId` - Purchase relationships
- `amountPaid` - Total sats paid (may exceed price if user over-zapped)
- `paymentType` - Payment method: "zap" (default), "manual", "comped", "refund"
- `zapReceiptId` - Optional NIP-57 zap receipt event ID for audit/dedupe
- `invoice` - Optional bolt11 invoice string captured at purchase time
- **Unique constraint**: `(userId, courseId, resourceId)` prevents duplicate purchases

### Price Resolution
- Prefer database prices (`Resource.price`, `Course.price`)
- Nostr events can also indicate pricing via NIP-99 kind `30402` or `price` tag
- Helper: `resolvePriceForContent({ resourceId?, courseId? })` returns canonical price

### Integration Points
1. **useInteractions Hook**: Surfaces `viewerZapTotalSats` and zap receipt tracking
2. **usePurchaseEligibility Hook**: Monitors eligibility and auto-claims when threshold met
3. **PurchaseDialog Component**: Complete purchase UX with zap sender integration
4. **Content Gating**: Check `Purchase` presence before showing premium content

## Common Pitfalls to Avoid

1. **Don't add domains to next.config.ts** - Use OptimizedImage component instead
2. **Don't create new mock data files** - Use existing JSON structure
3. **Don't bypass the adapter pattern** - Always use adapters for data access
4. **Don't ignore TypeScript errors** - Fix them properly
5. **Don't skip cache invalidation** - Update caches when data changes
6. **Don't create files unless necessary** - Prefer editing existing files
7. **Don't bypass purchase validation** - Always use `/api/purchases/claim` for creating purchases
8. **Don't assume zaps equal purchases** - Purchases must be explicitly claimed via the API