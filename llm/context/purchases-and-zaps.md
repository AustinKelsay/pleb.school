# Payments & Zaps Overview (2025-11-25)

## Current State
- Purchase flow is live via NIP-57 zaps; entitlement is recorded in `Purchase` rows once the server verifies zap receipts (`src/app/api/purchases/claim/route.ts`).
- UI gates paid resources/courses on the client and server; purchase dialogs reuse the zap sender flow and auto-claim zaps when totals meet the sticker price.
- Generic tipping (Zap dialog) works when logged out; purchases still require an authenticated session.
- Price source is the database when present; a Nostr price hint is only used as a fallback and for mismatch logging.

## Data Model & Pricing
- `prisma/schema.prisma` `Purchase`: `userId`, `courseId?`, `resourceId?`, `amountPaid`, `paymentType` (default `zap`), optional `zapReceiptId` (unique), `invoice`, `zapReceiptJson`, `zapRequestJson`.
- Unique `(userId, courseId, resourceId)` enforces one purchase per user/item; zap receipts are additionally guarded by a unique `zapReceiptId` plus JSON containment checks to stop reuse.
- `resolvePriceForContent` (`src/lib/pricing.ts`) returns the authoritative price, note id, and owner pubkey; DB price beats Nostr price hints and logs mismatches.

## User Flows
- **Send a zap (tip)**: `ZapDialog` + `useZapSender` resolve LNURL/Lightning address, sign zap requests (server key, NIP-07, or anonymous), request invoice, check description hash, attempt WebLN, then surface the invoice/QR for manual pay.
- **Purchase via zap**: `PurchaseDialog` requires auth, lets the user pick sats, optional privacy toggle, sends a zap, then calls `usePurchaseEligibility.claimPurchase` with the invoice/receipts to record the purchase.
- **Auto-claim past zaps**: `useInteractions` streams zap receipts for the content; when `viewerZapTotalSats ≥ price` and receipts match the event/a-tag, `usePurchaseEligibility` auto-POSTs `/api/purchases/claim` to upsert the purchase.

## Access & Gating
- Resource/course API routes include user-specific purchases; access is granted when any purchase amountPaid ≥ price. Unpurchased paid items return limited metadata and a `requiresPurchase` flag.
- Resource deletion is blocked if purchases exist; lessons endpoints short-circuit and return counts only when the viewer hasn’t purchased paid content.

## Verification & Audit Trail
- Server validates zap receipts: relay fetch, signatures, invoice hash vs zap request, amount > 0, recipient/event match, payer pubkey matches linked account (session pubkey or `P` tag), and LNURL metadata supports NIP-57.
- Stores `zapReceiptJson` (one or many receipts) and `zapRequestJson` for offline audits; merges new receipts while preventing reuse across users.

## Edge Cases Already Covered
- Duplicate receipt defense through both unique `zapReceiptId` and JSONB containment queries.
- Multi-zap purchases aggregate only newly seen receipts and add incremental `amountPaid`.
- Privacy mode signs with an anonymous key but injects a `P` tag with the real session pubkey so claims still bind to the buyer.
- Price mismatches between Nostr hint and DB are logged via `resolvePriceForContent.onMismatch`.
- Non-zap payment types (`manual`, `comped`, `refund`) are guarded by an admin check.

## Uncovered / Risky Edge Cases
- Purchase dialog treats any returned purchase as “owned”, even if `amountPaid < price`, which can mislead users after a partial payment; server still keeps content locked.
- Claims rely on finding zap receipts on default relays; receipts published only elsewhere or delayed will cause claim failures/retries.
- No use of payment preimage or lightning proof beyond zap receipt; invoices marked paid by WebLN without a published receipt may remain unclaimed.
- If the user lacks a linked Nostr pubkey, zap claims are rejected; logged-out zaps cannot be retroactively bound to an account.
- Content without a `noteId` **and** owner pubkey cannot be purchased (server rejects the claim).
- LNURL providers that omit description hashes or NIP-57 support will fail validation; there is no fallback to accept non-zap invoices.
- No background worker to reconcile late receipts; the frontend must retry claims manually.
