# Repository Guidelines

## Structure
- App Router pages and API routes live in `src/app/`.
- Shared UI and logic live in `src/components/`, `src/contexts/`, `src/hooks/`, `src/lib/`, `src/data/`, and `src/types/`.
- `config/` is client-visible JSON.
- Prisma schema, migrations, and seed data live in `prisma/`.
- Long-form references live in `docs/` and `llm/`.

## Commands
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npx prisma db push
npm run db:seed
```

Use `npm run lint && npm run typecheck` for fast verification and `npm run build` before committing.

## Rules
- Keep the existing TypeScript/React style, route-folder naming, and `@/` import pattern.
- Use adapters for data access rather than ad hoc direct DB reads.
- Update relevant `llm/` docs for meaningful architecture, API, or behavior changes.

## PR Rules
- Keep commit messages short and descriptive.
- Call out schema changes and whether `db push` or a migration is required.
- Unless instructed otherwise, attempt to run the CodeRabbit CLI on unstaged changes before committing and pushing.

## Security
- `config/` is client-visible; secrets belong in `.env.local`.
- Required env vars include `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `PRIVKEY_ENCRYPTION_KEY`.

## Engineering Principles
**1. Think Before Coding**: State assumptions, surface uncertainty, and present tradeoffs.
**2. Simplicity First**: Minimum code required. No speculative features or unnecessary abstractions.
**3. Surgical Changes**: Touch only what is necessary. Match existing style.
**4. Goal-Driven Execution**: Define success via verifiable tests/checks.
