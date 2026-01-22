# Auth & Account Linking Upgrade Plan

Author: Codex
Last Updated: 2026-01-11

Status: The upgrade work described here is **implemented** in the current codebase. Notes below reflect current behavior; migration scripting remains a separate task if legacy data exists.

---

## NIP-98 Authentication (Security Fix - 2026-01-11)

The NIP-07 login flow now uses [NIP-98 HTTP Auth](https://nips.nostr.com/98) to cryptographically verify pubkey ownership. This prevents account impersonation attacks where an attacker could previously log in as any Nostr user by simply providing their pubkey.

### How It Works

**Client-side (`src/app/auth/signin/page.tsx`):**
1. Get pubkey from NIP-07 extension: `window.nostr.getPublicKey()`
2. Create NIP-98 auth event (kind 27235) with URL and method tags
3. Sign with extension: `window.nostr.signEvent(authEvent)`
4. Send both pubkey and signed event to server

**Server-side (`src/lib/auth.ts:263-332`):**
1. Parse and validate the NIP-98 event
2. Verify signature using `snstr.verifySignature()`
3. Confirm pubkey in signed event matches claimed pubkey
4. Check timestamp is within 60 seconds (NIP-98 suggests "reasonable window", we chose 60s)
5. Validate URL tag matches callback endpoint
6. Validate method tag is POST

### Security Properties

| Check | What It Prevents |
|-------|------------------|
| Signature verification | Impersonation - proves pubkey ownership |
| Timestamp window (60s) | Replay attacks (configurable; 60s follows NIP-98 suggestion) |
| URL tag validation | Cross-site replay |
| Method tag validation | Request method confusion |

### Error Handling

All validation failures return a generic "Authentication failed" message to avoid leaking information about which check failed. Detailed errors are logged server-side for debugging.

### Breaking Change

Existing NIP-07 users must re-authenticate. The extension will prompt for a signature, which is handled transparently by the updated sign-in page.

---

## 1. Current Behavior Snapshot

- **Automatic hierarchy enforcement:** Linking flows now promote/demote accounts immediately (anon → OAuth → Nostr) without waiting for manual “make primary” actions.
- **Key custody truth:** Linking a real Nostr identity replaces the stored platform keypair with the user’s pubkey and clears `privkey`, ensuring future signing requires their extension.
- **Signing-mode clarity:** Publishing logic checks `privkey` presence rather than `session.provider`; only users without a stored key are routed through NIP-07.
- **Anonymous UX:** Anonymous accounts never require NIP-07. They can publish with the platform-managed key until they intentionally link real Nostr, at which point the platform key is removed.

## 2. Capabilities & Rules

### 2.1 Automatic Upgrade / Downgrade Logic

| Trigger | Expected Result |
|--------|-----------------|
| Anonymous signup (generated keys) | `primaryProvider = 'anonymous'`, `profileSource = 'nostr'`. |
| Anonymous links Email/GitHub | Immediately switch to OAuth-first: `primaryProvider` becomes that OAuth provider, `profileSource = 'oauth'`. Keep generated keypair. |
| Anonymous links NIP-07 | Promote to Nostr-first: replace pubkey with linked pubkey, null `privkey`, keep anon account for history, `primaryProvider = 'nostr'`, `profileSource = 'nostr'`. |
| OAuth-first links NIP-07 | Promote to Nostr-first: update `primaryProvider/profileSource`, copy linked pubkey into `User.pubkey`, null `privkey`, and run a Nostr profile sync. |
| OAuth-first links another OAuth | Primary stays whichever came first unless user changes manually (no auto change). |
| Nostr-first links OAuth after upgrade | Remain Nostr-first; OAuth accounts behave as recovery/secondary. |

Key notes:
- `linkAccount` now normalises provider IDs, mutates `primaryProvider/profileSource` inside the transaction, and (for Nostr) rewrites `pubkey/privkey`.
- The linking UI redirects back to `/profile` after success, guaranteeing the profile tabs, header, and aggregated API data refresh in lockstep.

### 2.2 Key Migration & Storage Rules

Requirements:
1. When linking `provider === 'nostr'`, the supplied pubkey becomes the canonical `User.pubkey`.
2. Any stored `privkey` is nulled immediately (OAuth-first → Nostr-first migration).
3. Anonymous and OAuth-first providers still generate/stash keys server-side so they can sign without NIP-07.
4. Linking anonymous when a key already exists is idempotent—the system reuses the stored keypair.
5. A Nostr profile sync runs right after the database update (best-effort, outside the transaction).

### 2.3 Signing Mode Detection

Rule: *If `User.privkey` exists → server-side signing allowed. Otherwise require NIP-07.*

Changes:
- Direct checks on `Boolean(user.privkey)` are used instead of a dedicated `hasServerSideKey` helper.
- `isNip07User` usage is aligned across:
  - `src/lib/publish-service.ts`
  - `src/lib/republish-service.ts`
  - `src/hooks/usePublishDraft.ts`
  - any other places gating UI flows.
- Instead of inferring from `session.provider`, we base the decision on `session.user.privkey` (client) or DB lookups (server). If `privkey` absent ⇒ prompt for NIP-07.
- Whenever a user becomes Nostr-first, the JWT/session callbacks stop embedding `privkey`, so the UI automatically flips to the NIP-07 path.

### 2.4 Anonymous Provider Classification

- `isNip07User` returns `true` **only** for `provider === 'nostr'`.
- Publishing hooks treat anonymous accounts as server-side signers; the UI exposes the stored key so users can export it.
- Sign-in messaging clarifies that anonymous access never requires NIP-07 (extensions only show up when explicitly linking Nostr).

### 2.5 Data Migration & Backfill

Legacy production data may still contain mismatched `profileSource/primaryProvider` values. No migration script is present in the repo; if needed, a one-off migration should:
- Null any lingering `privkey` rows where `profileSource='nostr'`.
- Re-run `syncUserProfileFromNostr` for users whose `primaryProvider` already equals `'nostr'` but have stale profile fields.
- Backfill `profileSource` anywhere it is `NULL` by mirroring `primaryProvider`.
- Optionally flag anonymous `Account` rows that no longer own the active pubkey to simplify analytics.

### 2.6 API & UI Adjustments

- `/api/account/linked` immediately reflects the recalculated `primaryProvider/profileSource`; the UI shows updated badges right after link completion.
- Linking flows now push back to `/profile` so all tabs re-fetch identity data in a clean state.
- Profile display, settings, and header share the same `profile:updated` event to stay synchronized.

### 2.7 Testing & Verification

Manual checklist (per environment):
1. **Anonymous → OAuth upgrade**: sign up anon, link email, ensure profile switches to OAuth-first and `privkey` remains stored.
2. **Anonymous → Nostr upgrade**: sign up anon, link NIP-07, confirm:
   - `primaryProvider='nostr'`
   - `privkey` null
   - future publishing requires NIP-07.
3. **OAuth → Nostr upgrade**: sign in via GitHub, link NIP-07, verify server-side keys removed and signing uses extension.
4. **Nostr-first + OAuth login**: Link GitHub, log out/in using GitHub, ensure publishing still routes through NIP-07 since `privkey` absent.
5. **Anon publishing without extension**: ensure resource publish succeeds (server-side signing).
6. **Migration script dry-run**: run against staging DB, inspect logs before applying in production.

Document outcomes in PR checklists and note which flows were smoke-tested (Nostr link, email link, GitHub link, unlink, make primary).

## 3. Open Considerations

- Historical clean-up script (see §2.5) is not in this repo.
- Consider pruning dormant anonymous Account rows once a user migrates to Nostr-first to simplify analytics.
- Admin tooling already exists via `/api/account/preferences`, but we may want explicit UI for support to resolve edge cases faster.

## 4. Operational Checklist

1. Keep GitHub/Email credentials up to date for both sign-in and linking flows.
2. Run the forthcoming migration script before cutting a production release if legacy users exist.
3. Maintain relay availability for the Nostr sync helper; sync is best-effort and leaves existing DB values intact if relays fail.
4. Monitor logs for `Failed to sync Nostr profile after linking` to proactively catch relay issues.
