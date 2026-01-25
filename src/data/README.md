# Data Directory (status: 2025-12-07)

This file documents what lives in `src/data/`, how it is actually used today, and what is legacy.

## What’s here
- `types.ts`: Core domain types (`Course`, `Resource`, `Lesson`, `ContentItem`, etc.) plus Nostr parsers (`parseCourseEvent`, `parseEvent`) and display helpers. These types are widely imported by API routes, hooks, adapters, and UI, so changes are breaking.
- `config.ts`: UI-facing label maps and icon proxies (content-type icons, category labels, etc.) used by cards and search components.

## Actual data flow (current codepath)
1) Primary source: PostgreSQL via Prisma through `src/lib/db-adapter.ts`. All API routes (`/api/courses`, `/api/resources`, lessons, profile content, etc.) call this adapter, so running Postgres and migrations is required for the app to work.
2) Client-side enrichment: Hooks such as `useCoursesQuery` and `useCourseQuery` fetch the API data, then try to hydrate Nostr notes via `snstr` `RelayPool.querySync`, using `DEFAULT_RELAYS` from `config/nostr.json`. The query matches the entity `id` against the event’s `d` tag and looks for kinds `30004/30023/30402`. If no note is found, the UI still renders using DB data.
3) Server-side Nostr fetches are enabled in `fetchNostrEvent` and are used by adapter helpers like `findByIdWithNote` (e.g., metadata generation). Most API responses still return DB-only data unless they call the note-aware helpers.
4) `noteId` columns exist in the DB schema and seeds, but the client hooks don’t use them yet—they rely on `id` ←→ `d` tag matching. Aligning note lookup to `noteId` is a known gap.

## Removed mock layer
- The former JSON fixtures in `src/data/mockDb/` and the accompanying `src/lib/mock-db-adapter.ts` have been removed. Prisma-backed data is now the only supported path. If you need lightweight fixtures, add a Prisma seed or test factory instead.

## File-by-file quick reference
- `src/data/types.ts`: Domain + Nostr types, parsers, display builders.
- `src/data/config.ts`: Labels and icon proxy helpers referenced by cards/search UI.

## Known gaps / to-dos
- Use `noteId` (event IDs) when hydrating Nostr data instead of assuming `id` == `d` tag.
- Consider adding caching for server-side Nostr fetches to reduce relay load and metadata latency.

## How to verify today
- Runtime path: start Postgres, run `npm run db:push && npm run dev`; the app reads Prisma.
- Nostr hydration: ensure relays in `config/nostr.json` are reachable from the browser; notes appear only if the relays contain events whose `d` tag matches course/resource IDs.
