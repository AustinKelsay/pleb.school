# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds the Next.js App Router routes, with API endpoints under `src/app/api/`.
- `src/components/`, `src/contexts/`, `src/hooks/`, and `src/lib/` contain UI, providers, hooks, and core services/utilities.
- `src/data/` hosts shared types and Nostr parsing helpers; `src/types/` holds TypeScript declarations.
- `config/` contains JSON runtime configuration (client-shipped). Keep secrets out of this directory.
- `prisma/` contains the schema, migrations, and seed data.
- `docs/` and `llm/` store longer-form references and architecture notes.

## Build, Test, and Development Commands
```bash
npm run dev          # Local dev server
npm run build        # Production build (runs prisma generate)
npm run start        # Serve production build
npm run lint         # ESLint (Next.js core-web-vitals + TS)
npm run test         # Vitest test run
npx prisma db push   # Sync schema to local DB
npm run db:seed      # Seed database
```
Before committing, run `npm run build && npm run lint`.

## Coding Style & Naming Conventions
- TypeScript + React; follow existing file style (2-space indent, double quotes).
- Components: pages use `export default function PageName() {}`; shared UI uses `export const ComponentName = () => {}`.
- Hooks are `useSomething`, components/contexts in PascalCase, route folders in kebab-case.
- Import order: React/Next → third-party → internal (`@/`).
- Data access uses adapters (e.g., `CourseAdapter`, `ResourceAdapter`); avoid direct DB reads.
- Use `OptimizedImage` for remote images instead of adding domains to `next.config.ts`.

## Testing Guidelines
- Framework: Vitest. Tests live in `src/lib/tests/` and follow `*.test.ts`.
- Cover new utility logic and purchase/auth flows with unit tests when touched.
- Run `npm run test` locally; no explicit coverage threshold is enforced.

## Commit & Pull Request Guidelines
- Commit history favors short, lowercase, descriptive phrases (e.g., “production hardening”). Keep to one line.
- PRs should include: what/why, test commands run, screenshots for UI changes, and any config/env updates.
- Call out schema changes in `prisma/schema.prisma` and whether `db push` or a migration is needed.

## Documentation Maintenance
- When making code changes, update relevant LLM documentation in `llm/` directory within reason.
- **`llm/context/`**: Update architecture docs for system pattern changes, data flow modifications, or new abstractions.
- **`llm/implementation/`**: Update implementation guides when modifying APIs, services, or core utilities.
- Update docs for significant changes (architecture, patterns, APIs, behavior); skip for trivial fixes or cosmetic changes.

## Security & Configuration Tips
- `config/` is client-visible. Secrets belong in `.env.local`.
- Required env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `PRIVKEY_ENCRYPTION_KEY`.
