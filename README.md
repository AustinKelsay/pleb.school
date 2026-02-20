# pleb.school

A Nostr-native course platform built with Next.js 15 and React 19. Fork this repo to launch your own white-label learning hub with Lightning payments and decentralized content.

## Quick Start

**Prerequisites:** Node.js 20.19+, PostgreSQL (or Docker)

```bash
git clone <repository-url>
cd pleb.school
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Database setup
npx prisma generate
npx prisma db push

# Start development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

### Hybrid Data Model

**Database stores metadata, Nostr stores content.**

| Layer | Storage | Data |
|-------|---------|------|
| PostgreSQL | Prisma ORM | Users, purchases, progress, prices, relations |
| Nostr | Relay network | Content via NIP-23 (articles) and NIP-99 (paid listings) |
| Display | Parser functions | Merged view for the UI |

### NIPs Used

| NIP | Purpose |
|-----|---------|
| 01 | Basic event structure |
| 07 | Browser extension signing |
| 19 | Bech32 encoding (npub, naddr) |
| 23 | Long-form content (kind 30023) |
| 51 | Lists/courses (kind 30004) |
| 57 | Zaps (Lightning payments) |
| 99 | Paid content (kind 30402) |

### Purchase Flow

Purchases use NIP-57 zaps with aggregation:

1. User zaps accumulate toward content price
2. When `zapTotal >= price`, purchase auto-claims via `/api/purchases/claim`
3. Use `usePurchaseEligibility` hook to check state
4. Never create purchases directly—always use the claim API

## Authentication

Dual identity architecture supporting Nostr-native and OAuth users.

**Nostr-first** (NIP07, Anonymous):
- Nostr profile is source of truth
- Profile syncs from relays on login
- NIP07 users control keys via browser extension
- Anonymous users get platform-managed ephemeral keys

**OAuth-first** (Email, GitHub):
- OAuth profile is authoritative
- Ephemeral Nostr keypairs generated for protocol access
- No Nostr profile sync

### Session Data

```typescript
const { data: session } = useSession()

session?.user?.pubkey       // Nostr public key (all users)
session?.user?.privkey      // Only for ephemeral accounts
session?.user?.nip05        // Nostr address
session?.user?.lud16        // Lightning address
session?.user?.nostrProfile // Full profile (Nostr-first only)
```

## Project Structure

```text
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── auth/             # NextAuth endpoints
│   │   ├── account/          # Account management, OAuth linking
│   │   ├── admin/            # Admin endpoints
│   │   ├── courses/          # Course CRUD
│   │   ├── resources/        # Resource CRUD
│   │   ├── lessons/          # Lesson endpoints
│   │   ├── purchases/        # Purchase/claim
│   │   ├── drafts/           # Draft management
│   │   ├── profile/          # Profile endpoints
│   │   ├── views/            # View counter
│   │   └── health/           # Health check
│   ├── courses/[id]/         # Course pages
│   ├── content/[id]/         # Resource pages
│   ├── create/               # Content creation
│   ├── drafts/               # Draft management
│   ├── feeds/                # Content feeds
│   ├── profile/              # User profile
│   ├── search/               # Search
│   └── settings/             # User settings
├── components/
│   ├── ui/                   # Base UI (Radix-based)
│   ├── layout/               # Layout components
│   ├── auth/                 # Auth components
│   ├── purchase/             # Purchase flows
│   ├── zap/                  # Lightning/zap components
│   └── homepage/             # Homepage sections
├── lib/
│   ├── auth.ts               # NextAuth config
│   ├── db-adapter.ts         # Database adapters
│   ├── cache.ts              # L1/L2 caching
│   ├── nostr-events.ts       # Event builders (NIP-23/99/51)
│   ├── nostr-relays.ts       # Relay configuration
│   ├── publish-service.ts    # Draft publishing
│   ├── pricing.ts            # Price resolution
│   └── prisma.ts             # Prisma client
├── hooks/                    # 28 React hooks
├── contexts/                 # React contexts
│   ├── snstr-context.tsx     # Nostr relay pool
│   ├── theme-context.tsx     # Theme management
│   ├── query-provider.tsx    # TanStack Query
│   └── session-provider.tsx  # NextAuth session
├── data/
│   ├── types.ts              # Types + parsers
│   └── config.ts             # Type labels/icons
└── types/                    # TypeScript declarations
```

## Configuration

JSON files in `/config/` control runtime behavior. **Never put secrets here—they ship to the client.**

| File | Purpose |
|------|---------|
| `auth.json` | Auth providers and UI |
| `theme.json` | Theme/font defaults |
| `content.json` | Content display, filters |
| `copy.json` | User-facing text |
| `payments.json` | Zap presets, purchase UX |
| `nostr.json` | Relay sets |
| `admin.json` | Admin pubkeys |

See [`config/README.md`](./config/README.md) for details.

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript checks (`tsc --noEmit`) |
| `npm run test` | Run tests (Vitest) |
| `npm run ci:gate` | Release gate (`lint` + `typecheck` + `test` + `build`) |
| `npm run ci:migrate:deploy` | Apply pending Prisma migrations |
| `npx prisma generate` | Generate Prisma client |
| `npx prisma db push` | Push schema to database |
| `npx prisma studio` | Database browser |
| `npm run db:seed` | Seed database |

### Docker

```bash
docker compose up db    # PostgreSQL only
docker compose up app   # Full stack
```

### GitHub OAuth Setup

**Sign-in OAuth App:**
- Callback: `http://localhost:3000/api/auth/callback/github`
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

**Account Linking OAuth App (optional):**
- Callback: `http://localhost:3000/api/account/oauth-callback`
- Set `GITHUB_LINK_CLIENT_ID` and `GITHUB_LINK_CLIENT_SECRET`

## CI/CD Production Gate

Production gating is defined in `.github/workflows/deploy-gate.yml`.

- On pull requests to `main`: runs `npm run ci:gate` and blocks merge when checks fail.
- On pushes to `main`: runs the same quality gate first, then runs `npm run ci:migrate:deploy`.
- Migration deploy runs only after the quality gate succeeds.

### GitHub setup requirements

- Keep migration deploy disabled in dev by leaving repository variable `ENABLE_PROD_MIGRATIONS` unset (or set to `false`).
- When you are ready for staging/production migration deploys, set repository variable `ENABLE_PROD_MIGRATIONS=true`.
- Add repository secret `DATABASE_URL` (production/staging database URL) before enabling migration deploys.
- Configure branch protection on `main` to require the `quality-gates` status check.
- Keep `prisma/migrations/**` committed in git; `prisma migrate deploy` depends on checked-in migration files.

### Production cutover checklist (do this later)

1. Confirm release gate passes locally: `npm run ci:gate`
2. In GitHub repo settings, add secret `DATABASE_URL` (target production DB).
3. In GitHub repo settings, set variable `ENABLE_PROD_MIGRATIONS=true`.
4. In branch protection for `main`, require status check `quality-gates`.
5. Merge to `main` and verify workflow:
   - `quality-gates` passes first
   - `migrate-production` runs after it and succeeds
6. If needed, disable migration deploy quickly by setting `ENABLE_PROD_MIGRATIONS=false`.

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `NEXTAUTH_SECRET` | Yes | JWT encryption secret |
| `NEXTAUTH_URL` | Yes | App URL |
| `PRIVKEY_ENCRYPTION_KEY` | Yes | Base64 32-byte key for privkey encryption |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth |
| `GITHUB_LINK_CLIENT_ID` | No | Account linking OAuth |
| `GITHUB_LINK_CLIENT_SECRET` | No | Account linking OAuth |
| `EMAIL_SERVER_*` | No | SMTP settings |
| `EMAIL_FROM` | No | Sender address |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) |
| `KV_REST_API_URL` | Yes (production) | Vercel KV endpoint for distributed rate limiting and view counters |
| `KV_REST_API_TOKEN` | Yes (production) | Vercel KV token for distributed rate limiting and view counters |
| `VIEWS_CRON_SECRET` | No | View counter flush auth |
| `NEXT_PUBLIC_ENABLE_REMOTE_FONTS` | No | Runtime remote font loading toggle (`true`/`false`). Default: `false` in production, `true` in dev/test |

## Tech Stack

- **Next.js 15** with App Router
- **React 19**
- **TypeScript 5**
- **Prisma 7** + PostgreSQL
- **NextAuth.js 4**
- **TanStack Query 5**
- **Tailwind CSS 4**
- **Radix UI**
- **Zod 4**
- **snstr** for Nostr
- **zapthreads** for Lightning

## View Counter

```typescript
import { ViewsText } from '@/components/ui/views-text'

<ViewsText ns="content" id={resourceId} />
```

- `POST /api/views` — increment
- `GET /api/views?key=...` — read
- `GET /api/views/flush` — KV to Postgres (cron)

## Documentation

- [`config/README.md`](./config/README.md) — Configuration reference
- [`llm/context/`](./llm/context/) — Architecture docs
- [`CLAUDE.md`](./CLAUDE.md) — Development guidelines

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Austin](https://github.com/AustinKelsay). Fork it, rebrand it, ship your own Nostr-native learning hub.
