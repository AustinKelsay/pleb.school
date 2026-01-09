# Account Linking Implementation Guide

## Overview
The account linking system lets a signed-in user attach additional authentication providers without losing their original identity source. It keeps the first sign-in method as the `primaryProvider`, enforces one-provider-per-account uniqueness, and exposes a UI for linking, unlinking, and changing the primary source while surfacing accurate toasts for success and failure states.

## Supported Providers & Data Model
- `AuthProvider` (in `src/lib/account-linking.ts`) supports `nostr`, `email`, `github`, `anonymous`, and `recovery`. Only `nostr`, `email`, and `github` are linkable through the UI; `anonymous`/`recovery` exist for initial login or backup flows and are filtered from the linking buttons.
- Prisma models (`prisma/schema.prisma`) hold configuration:
```prisma
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String?
  access_token       String?
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String?
  session_state      String?
  oauth_token_secret String?
  oauth_token        String?
  createdAt          DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model User {
  id              String   @id @default(uuid())
  primaryProvider String?
  profileSource   String?  @default("oauth") // "nostr" | "oauth"
  pubkey          String?  @unique
  privkey         String?
  email           String?  @unique
  // ...other profile fields
}
```

## Server-Side Flow (App Router routes)
- `POST /api/account/link` (`src/app/api/account/link/route.ts`)
  - Accepts `LinkAccountSchema` (provider + providerAccountId + optional OAuth metadata).
  - Validates the payload, ensures the provider/account is unused via `canLinkAccount`, and then delegates to the shared `linkAccount` helper before returning the JSON response.
- `POST /api/account/send-link-verification` sends the email verification link after sanitising input, ensuring the email is not in use, and inserting a one-hour token into `VerificationToken`.
- `POST /api/account/verify-email` verifies a short code (token) against a lookup ref (`ref`) created by `send-link-verification`, then links the email via `linkAccount` and backfills `User.email`/`emailVerified` if empty. The user lands on `/verify-email?ref=...` to submit the code.
- `GET /api/account/link-oauth` constructs a base64 state payload `{ userId, action: 'link', provider: 'github' }` and redirects to GitHub using either the dedicated `_LINK_` client or the default credentials.
- `GET /api/account/oauth-callback` decodes/validates the state (`validateAndParseState`), exchanges the code for `access_token`, fetches the GitHub user id, and persists it with `linkAccount`. Failures redirect with granular `error` codes for the UI to surface.
- `GET /api/account/linked` returns `getLinkedAccounts`, including `primaryProvider`, `profileSource`, and real `createdAt` timestamps for each linked account.
- `POST /api/account/unlink` calls `unlinkAccount` but refuses to drop the last provider.
- `POST /api/account/primary` invokes `changePrimaryProvider` after verifying the provider is actually linked.
- `GET/POST /api/account/preferences` lets users align `profileSource` and `primaryProvider` with the same validation helpers as above.
- `POST /api/account/sync` refreshes profile data from Nostr or GitHub, refreshing OAuth tokens and clearing invalid credentials where required.

## Library Support (`src/lib/account-linking.ts`)
- `canLinkAccount` enforces provider uniqueness both globally and per user.
- `linkAccount`:
  - Normalises provider-specific identifiers (lower-case pubkeys, trimmed emails) and performs all provider-specific mutations.
  - Generates anonymous keys only when needed.
  - Automatically upgrades/downgrades `primaryProvider/profileSource` based on the transition table (anon → OAuth → Nostr).
  - When linking Nostr it copies the pubkey into `User.pubkey`, clears any stored `privkey`, and invokes `syncUserProfileFromNostr` so database fields (name, avatar, nip05, etc.) reflect the decentralized profile immediately.
- `unlinkAccount` and `changePrimaryProvider` keep the last login path intact and recompute profile source.
- `shouldSyncFromNostr` centralises the “nostr-first vs oauth-first” logic used by NextAuth callbacks.
- Nostr relay fetch & sync helpers live in `src/lib/nostr-profile.ts` and are reused by account linking, profile aggregation, and manual sync endpoints.
- Utility helpers like `getProviderDisplayName` and `mergeAccounts` support UI labels and future data migrations.

## Client Experience
- `LinkedAccountsManager` (`src/components/account/linked-accounts.tsx`) fetches `/api/account/linked`, surfaces `success`/`error` query params from email and GitHub redirects as toasts, shows badges for the primary provider, and exposes `Make Primary`/`Unlink` actions before refreshing the session via `updateSession()`. After a successful link, it now redirects back to `/profile` so every tab (Profile / Settings / Accounts / header) reloads with fresh data.
- `LinkProviderButton` handles provider-specific flows:
  - `nostr`: requires `window.nostr`, grabs the pubkey, and posts to `/api/account/link`.
  - `email`: opens a dialog, posts to `/api/account/send-link-verification`, and expects the user to click the emailed link.
  - `github`: redirects to `/api/account/link-oauth`.
  - Buttons disable when the provider is already the active session provider to avoid redundant linking.
- `ProfileTabs` (`src/app/profile/components/profile-tabs.tsx`) watches `?tab=accounts` query params to raise OAuth error toasts (and the GitHub success toast) before cleaning the URL.
- The `/profile` screen exposes account linking from the `accounts` tab (e.g. `/profile?tab=accounts`), keeping all provider-management actions consolidated in one place.

## Primary Provider & Profile Source Rules
- `session.provider` is populated inside `NextAuth` (`src/lib/auth.ts`) so the client can disable relinking the current method, but signing-mode decisions rely on whether `session.user.privkey` is present.
- Switching the primary provider updates `User.primaryProvider` and `profileSource` (`nostr` for Nostr/anonymous/recovery, `oauth` for email/GitHub) and drives downstream profile aggregation (`src/lib/profile-aggregator.ts`). The linking helper enforces the same rules server-side so auto-upgrades happen without manual “Make Primary” clicks.
- Nostr-first users trigger profile syncs on login and immediately after linking; OAuth-first users never overwrite database fields with Nostr metadata.

## Security & Validation
- All mutating routes enforce authenticated sessions via `getServerSession`.
- Email verification tokens are single-use, expire after 60 minutes, and are deleted on success or expiry.
- **Rate limiting** (via `src/lib/rate-limit.ts` using Vercel KV with in-memory fallback):
  - `POST /api/account/verify-email`: 5 attempts per ref per hour (prevents brute force on 6-digit codes)
  - `POST /api/account/send-link-verification`: 3 emails per address per hour (prevents spam)
- GitHub linking uses signed state values with strict length checks, schema validation, and session/user matching to mitigate tampering.
- `canLinkAccount` prevents hijacking by rejecting provider duplications and cross-user reuse.
- `unlinkAccount` prohibits removing the last provider so every account retains at least one sign-in path.

## Configuration
Ensure the following environment variables are present before exercising linking flows:
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (and optional `GITHUB_LINK_CLIENT_ID`/`GITHUB_LINK_CLIENT_SECRET` for dedicated linking flows)
- `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_SERVER_SECURE`, `EMAIL_FROM`
- Nostr linking requires a browser extension that injects `window.nostr` (e.g., Alby or nos2x).

## Known Gaps & Follow-Ups
- There is no automated test suite; manual smoke tests cover Nostr (NIP-07), email verification, GitHub OAuth, unlinking, and primary switching.
- GitHub linking relies on configured OAuth scopes (`user:email`); misconfiguration surfaces as `token_exchange_failed` or `user_fetch_failed` redirects.

## Testing Checklist
- Link Nostr via browser extension, confirm `primaryProvider` remains unchanged when adding secondary providers.
- Trigger email linking end-to-end (request, email link, verify redirect success).
- Link GitHub, ensuring state mismatches, duplicate provider attempts, and token exchange failures show the correct toast.
- Exercise unlinking guards (cannot remove the final provider) and primary switches, then refresh the session to confirm UI updates.
- Run `/api/account/sync` for Nostr and GitHub to confirm profile refresh and token invalidation behaviour.
