# Payments & Zaps Overview (2026-01-10)

## Current State
- Purchase flow is live via NIP-57 zaps; entitlement is recorded in `Purchase` rows once the server verifies zap receipts (`src/app/api/purchases/claim/route.ts`).
- UI gates paid resources/courses on the client and server; purchase dialogs reuse the zap sender flow and auto-claim zaps when totals meet the sticker price.
- Zap tips can work without a session **if a signer is available** (NIP-07 extension or a generated anonymous keypair—used for privacy mode or as a fallback when no other signer is available). Purchases still require an authenticated session.
- Price source is the database when present; a Nostr price hint is only used as a fallback and for mismatch logging.

## Data Model & Pricing
- `prisma/schema.prisma` `Purchase`: `userId`, `courseId?`, `resourceId?`, `amountPaid`, `priceAtPurchase?`, `paymentType` (default `zap`), optional `zapReceiptId` (unique), `invoice`, `zapReceiptJson`, `zapRequestJson`.
- Unique constraints on `(userId, courseId, resourceId)` plus `(userId, courseId)` and `(userId, resourceId)` enforce one purchase per user/item; zap receipts are additionally guarded by a unique `zapReceiptId` plus JSON containment checks to stop reuse.
- `resolvePriceForContent` (`src/lib/pricing.ts`) returns the authoritative price, note id, and owner pubkey; DB price beats Nostr price hints and logs mismatches.

## User Flows
- **Send a zap (tip)**: `ZapDialog` + `useZapSender` resolve LNURL/Lightning address, sign zap requests (server key, NIP-07, or anonymous), request invoice, check description hash, attempt WebLN, then surface the invoice/QR for manual pay.
- **Purchase via zap**: `PurchaseDialog` requires auth, lets the user pick sats, optional privacy toggle, sends a zap, then calls `usePurchaseEligibility.claimPurchase` with the invoice/receipts to record the purchase.
- **Unlock with past zaps**: when viewer totals meet the price, `PurchaseDialog` exposes a manual “Unlock with past zaps” CTA that calls `claimPurchase` without sending a new zap.
- **Auto-claim past zaps**: `useInteractions` streams zap receipts for the content; when `viewerZapTotalSats ≥ price` and receipts match the event/a-tag, `usePurchaseEligibility` auto-POSTs `/api/purchases/claim` to upsert the purchase.

## Access & Gating
- Resource/course API routes include user-specific purchases; access is granted when `amountPaid ≥ min(priceAtPurchase, currentPrice)` (snapshot-aware). Unpurchased paid items return limited metadata and a `requiresPurchase` flag.
- Resources can also unlock via purchased courses (`checkCourseUnlockViaLessons`); `unlockedViaCourse` + `unlockingCourseId` are returned.
- Resource deletion is blocked if purchases exist; `/api/lessons/[id]` returns limited resource metadata when locked.

## Verification & Audit Trail
- Server validates zap receipts: relay fetch with retry + relay hints, receipt + request signatures, invoice hash vs zap request, amount > 0, recipient match, event match via `e` or `a` tags, payer pubkey matches linked account (session pubkey or derived pubkey; `P` tag supported), and LNURL metadata supports NIP-57 (including provider pubkey match).
- Stores `zapReceiptJson` (one or many receipts) and `zapRequestJson` for offline audits; merges new receipts while preventing reuse across users.

## Edge Cases Already Covered
- Duplicate receipt defense through both unique `zapReceiptId` and JSONB containment queries.
- Multi-zap purchases aggregate only newly seen receipts and add incremental `amountPaid`.
- Privacy mode signs with an anonymous key but injects a `P` tag with the real session pubkey so claims still bind to the buyer.
- Price mismatches between Nostr hint and DB are logged via `resolvePriceForContent.onMismatch`.
- Non-zap payment types (`manual`, `comped`, `refund`) are guarded by an admin check.

## Uncovered / Risky Edge Cases
- Viewer totals can indicate eligibility before receipts propagate; auto-claim will fail until receipts are available on relays, which can confuse users.
- Claims rely on finding zap receipts on default/content/zapThreads relays plus provided hints; receipts published only elsewhere or delayed will cause claim failures/retries.
- No use of payment preimage or lightning proof beyond zap receipt; invoices marked paid by WebLN without a published receipt may remain unclaimed.
- If the user lacks a linked Nostr pubkey, zap claims are rejected; logged-out zaps cannot be retroactively bound to an account.
- Content without a `noteId` **and** owner pubkey cannot be purchased (server rejects the claim).
- LNURL providers that omit description hashes or NIP-57 support will fail validation; there is no fallback to accept non-zap invoices.
- No background worker to reconcile late receipts; the frontend must retry claims manually.
