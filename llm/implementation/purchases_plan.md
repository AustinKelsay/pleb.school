# Purchases Implementation Plan

Author: Codex  
Last Updated: 2025-11-21

## Product Truths (given)
- All payments are NIP-57 zaps; *any* zap can satisfy a purchase if the sender can be identified.
- Sum of a viewer's zaps for a piece of content counts toward the sticker price; once their total ≥ price we should mint a purchase record automatically.
- No new table is needed; use the existing `Purchase` model and write the record the moment eligibility is detected.
- Purchase CTA sends a zap. If a NIP-07 user declines to sign, we still create a fresh keypair for an anonymous zap but attach the resulting purchase to their user_id.
- Non-logged users are blocked from comment/like/purchase flows, but zaps must always be allowed (generate ephemeral keys client-side; let them pay the invoice immediately).

## Current State Snapshot
- Persistence exists (`Purchase` with `userId`, `courseId|resourceId`, `amountPaid`, unique constraint), but there is no API or UI to create purchases.
- Content pricing surfaces: `Resource.price`/`Course.price` in Prisma; Nostr events tag paid content via kind `30402` or `price` tag. Frontend currently treats `isPremium` as a visual flag and never gates on purchase state.
- Zap plumbing is solid: `useZapSender` signs via session `privkey` or NIP-07 and validates description hash; `useInteractions` already surfaces per-sender totals (`viewerZapTotalSats`) and recent zap receipts.
- Auth model: OAuth/anon users have server-side keys; NIP-07 users do not. `useZapSender` currently *requires* an authenticated session before sending a zap, so unauthenticated tips are blocked (needs change).

## Objectives for v1 (purchase-ready)
1) Treat zaps as the sole payment rail and record entitlements once zap totals hit the price.  
2) Provide a purchase modal that defaults to the price, reuses zap flow, and shows unlock state.  
3) Allow non-authenticated visitors to send zaps without blocking, while still requiring sign-in for comments/likes/purchases.  
4) Offer a privacy-preserving path for NIP-07 users (fallback anonymous zap) that still writes a purchase for their account.  
5) Keep parity between DB-backed prices and Nostr-tagged prices to avoid accidental under/over-charging.

## Workstreams & Steps

### 1) Entitlement detection from zaps
- Extend `useInteractions` to expose a stable callback/state when `viewerZapTotalSats` or `zapSenderTotalsRef` cross a configurable threshold (price in sats). Avoid double-firing across rerenders.
- Add a small client helper (`usePurchaseEligibility`) that receives `{ priceSats, resourceId|courseId }` and binds to the zap totals; when eligibility is met and the user is signed in, call a purchase claim API (below) to upsert the `Purchase` row.
- For first-time NIP-07 logins, run the same eligibility check on mount so off-platform zaps are automatically claimed.

### 2) Purchase persistence API (no new tables)
- Add `POST /api/purchases/claim` that requires auth and accepts `{ resourceId?, courseId?, amountPaid, zapTotalSats, zapReceiptIds? }`.
  - Server resolves canonical price from DB; rejects if item missing or both IDs absent; caps `amountPaid` to `price` for entitlement but stores actual sats sent.
  - Upsert on `(userId, courseId, resourceId)`; return `{ alreadyOwned, created, amountCredited }`.
- Optional (if we need provenance): add columns to `Purchase` for `paymentType` (`'zap'|'manual'`), `zapReceiptId` (string), and `lightningAddress` (string). If we keep schema unchanged, store provenance in `amountPaid` + request body only.
- Update existing content fetchers (`/api/resources/[id]`, `/api/resources/[id]/lessons`, `/api/profile/content`) to include `requiresPurchase` based on `Purchase` presence and surface the `amountPaid` so the UI can show “unlocked via zaps”.

### 3) Purchase modal & CTA
- New `PurchaseDialog` component beside existing zap dialog:
  - Pre-fill amount = `price` (min lock to price), reuse `useZapSender` for invoice + payment, and mirror status chips/toasts.
  - Show “Already unlocked” state if `Purchase` exists *or* `viewerZapTotalSats ≥ price`.
  - After a successful zap (WebLN or manual), wait for a matching zap receipt (or accept WebLN success) then call `/api/purchases/claim` with the paid amount.
- Add a “Keep my zap private” toggle for NIP-07 users: on toggle, generate a fresh ephemeral keypair client-side for the zap request (anonymous zap per NIP-57 `P` tag) but still invoke the claim API with the signed-in `userId`.

### 4) Non-auth zap path
- Relax `useZapSender` gating: when `sessionStatus !== 'authenticated'`, generate a disposable keypair in-memory (or persisted in `localStorage` for retries) and let the user send a zap with only lightning address/LNURL resolution. No purchase claim is attempted without a session.
- UI copy: For comment/like/purchase buttons keep the sign-in redirect; for the zap button show “Tip without signing in” when logged out.

### 5) Price harmonization & lookup
- Introduce a small helper to resolve price for a content page: prefer DB price when available; otherwise use Nostr `price` tag or kind (30402 implies paid). Return `{ priceSats, source }` so we can log discrepancies.
- When a DB item advertises price=0 but the Nostr event has `price` >0, log a warning and treat price as the max of both to avoid undercharging; capture metrics for clean-up.

### 6) Smoke tests to run after implementation
- Zap-as-purchase with OAuth user (server-signed): send price zap, verify `Purchase` row and gated content unlocks without refresh.
- NIP-07 user declines signature, toggles “private zap”: verify zap request uses anonymous key, invoice paid, purchase recorded for their account.
- Off-platform zap claim: user zaps from another client, then signs in for first time → page detects historical zaps and auto-claims purchase.
- Logged-out visitor can send a zap, but attempting comment/like/purchase redirects to sign-in.
- Price mismatch handling: set Nostr price higher than DB, ensure UI shows the higher price and API rejects underpayment attempts.

## Open Questions / Decisions to confirm
- Do we need to store zap receipt IDs or description hashes on the `Purchase` row for audits, or is `amountPaid` sufficient for now? **(Decided: store `zapReceiptId` + `invoice` + `paymentType`.)**
- Should anonymous zaps for non-auth users ever create a latent claim token that they can attach after signing in, or do we deliberately treat them as pure tips? **(Decided: treat logged-out zaps as tips only; no claim tokens.)**
- How strict should we be about confirming a paid invoice before recording the purchase (WebLN success vs waiting for a zap receipt over relays)?
