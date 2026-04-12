# Data Directory (status: 2026-04-12)

This file documents what lives in `src/data/`, how it is actually used today, and what is legacy.

## What’s here
- `types.ts`: Core domain types (`Course`, `Resource`, `Lesson`, `ContentItem`, etc.) plus Nostr parsers (`parseCourseEvent`, `parseEvent`) and display helpers. These types are widely imported by API routes, hooks, adapters, and UI, so changes are breaking.
- `config.ts`: UI-facing label maps and icon proxies (content-type icons, category labels, etc.) used by cards and search components.

## Actual data flow (current codepath)
1) Primary source: PostgreSQL via Prisma through `src/lib/db-adapter.ts`. All API routes (`/api/courses`, `/api/resources`, lessons, profile content, etc.) still treat the database row as the canonical metadata and access-control source.
2) Server-first public catalog: `/` and `/content` now assemble their initial `ContentItem[]` on the server through `src/lib/content-catalog.server.ts`. Viewer purchase state is merged there before the first render.
3) Server note resolution: `src/lib/content-note-resolution.ts` resolves catalog notes by trying the DB `id` as a Nostr `#d` tag first, then falling back to `noteId` through `src/lib/note-reference-resolution.ts`. The note-reference path supports raw hex ids plus encoded references such as `note`, `nevent`, and `naddr`.
4) Merge behavior: `applyResolvedNoteToContentItem(...)` parses the winning event with `parseCourseEvent` or `parseEvent`, merges note-derived display fields, and marks `ContentItem.noteResolved` when note hydration succeeds.
5) Partial recovery: when the server cannot resolve a note, the item still renders immediately from DB-backed fallback fields with `noteResolved: false`. `src/hooks/useCatalogNoteRepair.ts` then retries only unresolved items in the browser and repairs them in place instead of restoring the old page-wide loading skeleton.
6) Resource readers: `src/lib/resource-page-data.server.ts` handles the reader/server metadata path. If a DB resource exists but the initial Nostr lookup misses, `ResourceContentInitialMeta.resourceNoteId` preserves the legacy fallback reference so the client reader can recover without a false 404.
7) Relay behavior: Nostr fetches are no longer limited to a single combined multi-relay query. `NostrFetchService.fetchEventsByDTags()` and note-reference lookups can retry unresolved items relay-by-relay, using the default relay set plus embedded relay hints when a reference format provides them.

## Removed mock layer
- The former JSON fixtures in `src/data/mockDb/` and the accompanying `src/lib/mock-db-adapter.ts` have been removed. Prisma-backed data is now the only supported path. If you need lightweight fixtures, add a Prisma seed or test factory instead.

## File-by-file quick reference
- `src/data/types.ts`: Domain + Nostr types, parsers, display builders.
- `src/data/config.ts`: Labels and icon proxy helpers referenced by cards/search UI.

## Known gaps / to-dos
- Consider adding caching and telemetry around server-side note fetches so relay misses and repair success rates are easier to track.
- Legacy content is still best-effort across the configured relay sets; when every lookup path misses, the UI falls back to DB metadata until a later repair succeeds.

## How to verify today
- Runtime path: start Postgres, run `npm run db:push && npm run dev`; the app reads Prisma.
- Homepage and `/content`: the first HTML response should render cards immediately from server data. If a note is unresolved server-side, the card should stay visible and may repair in place after hydration.
- Note resolution: verify content can resolve either by `#d` tag or by a legacy note reference in `noteId` (`hex`, `note`, `nevent`, `naddr`).
- Relay checks: ensure the relays from `config/nostr.json` are reachable and remember that encoded note references may contribute extra relay hints on top of the default set.
- Resource readers: confirm UUID-backed resources remain recoverable when the DB row exists, even if the first server-side note lookup misses.
