# Purchases & Zap Implementation (2025-11-25)

## Data & Pricing Anchors
- Schema: `prisma/schema.prisma` `Purchase` adds `paymentType`, optional `zapReceiptId` (unique), `invoice`, `zapReceiptJson`, `zapRequestJson`; uniqueness on `(userId, courseId, resourceId)` prevents duplicate entitlements per item.
- Price resolution: `src/lib/pricing.ts` `resolvePriceForContent` treats the DB price as authoritative and only falls back to the Nostr hint when the DB price is `null`. Mismatches are logged via `onMismatch` but not surfaced/blocked in the UI; checkout enforces the DB price while the dialog may temporarily show the stale Nostr hint until the price refreshes (see purchase-gaps.md §3 for mitigation options).
- Content gating: `src/app/api/resources/[id]/route.ts` and `src/app/api/courses/[id]/route.ts` include current-user purchases and gate paid content when `amountPaid < price`; unpurchased responses are trimmed. Resources cannot be deleted if any purchases exist (`DELETE` guard).

## Zap Discovery (client)
- `src/hooks/useInteractions.ts` subscribes to relays for kinds 9735/7/1 with filters on `eventId` or `a` tag; no timebox to retain full zap history for eligibility. There is currently **no server-side receipt fetch fallback**—auto-claim relies solely on the client’s live relay subscriptions; see purchase-gaps.md §4 for this limitation.
- `summarizeZapReceipt` parses amount from zap request, invoice, or amount tag (takes max), normalizes payer pubkeys (`pubkey` and `P` tags), extracts notes, and stores `ZapReceiptSummary`.
- Viewer totals: when payer pubkeys include the session pubkey, increments `viewerZapTotalSats` and keeps up to 200 `viewerZapReceipts`; used for auto-claim. Workarounds for missed receipts are the proposed server-side fetch and “retry claim” button noted in purchase-gaps.md §4.

## Zap Sending (client)
- `src/hooks/useZapSender.ts`: resolves lightning details (profile cache + LNURL/Lightning address), fetches LNURL metadata (cached per endpoint), enforces min/max sendable, builds zap request with relay hints and optional `a` tag, and supports three signing paths: server-stored privkey, anonymous generated keys (privacy), or NIP-07.
- Privacy mode: adds `P` tag with the real session pubkey when available; signer key may be anonymous. Invoice description hash is checked against the signed zap request before exposing the invoice.
- Attempts WebLN payment automatically; on failure exposes invoice+QR and `retryWeblnPayment`. State machine: `idle → resolving → signing → requesting-invoice → invoice-ready → paying → success|error`.

## Purchase Eligibility & Dialog
- Eligibility hook: `src/hooks/usePurchaseEligibility.ts` marks eligible when `viewerZapTotalSats ≥ price` and not already purchased. Auto-claims by POSTing `/api/purchases/claim` with receipt IDs (viewer receipts filtered to matching event/e-tag) and a price hint; cooldown/backoff on repeated failures.
- Claim payload: `{resourceId|courseId, amountPaid, paymentType (default zap), zapReceiptId(s), invoice?, zapTotalSats, nostrPrice}`; `amountPaid` defaults to `max(viewerZapTotalSats, price)`.
- UI: `src/components/purchase/purchase-dialog.tsx` requires auth, lets user choose amount, toggle privacy, sends zap via `useZapSender`, then invokes `claimPurchase`. Auto-claim is active even when the dialog is closed but rendered for locked content. Partial payments are recorded; unlock callbacks only flip UI when `amountPaid >= price`.

## Server Claim Pipeline (`POST /api/purchases/claim`)
1) Auth + payload validation (`zod`, `paymentTypeEnum zap|manual|comped|refund`); exactly one of `resourceId` or `courseId` required.  
2) Resolve canonical price + identifiers via `resolvePriceForContent`; reject if content missing or lacks both `noteId` and owner pubkey for zap claims.  
3) Build allowed payer list from session pubkey and derived pubkey (if server has privkey). If none → reject with guidance to link a pubkey.  
4) Zap validation per receipt (`validateZapProof`): accepts inline receipt events or fetches by ID with relay hints; fans out across `default`, `content`, and `zapThreads` relay sets and retries (6×, 800 ms) for late receipts; verifies receipt/request signatures, invoice vs receipt, description hash vs zap request, amount > 0, recipient matches owner pubkey, event/a-tag matches content note, payer (pubkey or `P` tag) matches allowed list, LNURL supports NIP-57 and signer matches provider.  
4b) No-receipt fallback removed: purchases are only credited when at least one zap receipt is verified. Users must retry once receipts land on relays.
5) Aggregate verified receipts (multi-receipt allowed); set `verifiedAmountSats` sum, keep representative invoice and zap request.  
6) Non-zap payment types require admin (`isAdmin`); trust provided amount/invoice.  
7) Duplicate defense: check `zapReceiptId` column and JSONB containment query to prevent reuse across purchases/users.  
8) Upsert logic: if purchase exists for user+item, merge new receipts (`mergeReceipts`), add only amounts tied to unseen receipt IDs, update `amountPaid`, `paymentType`, `zapReceiptId` (first), `invoice`, and store zap proofs. If no new receipts, return existing purchase unchanged.  
9) Create path: write new `Purchase` with verified amounts and stored proofs.  
10) Errors: Prisma FK/unique errors mapped to 404/409; all others surface 500 with message.

## Access & Downstream Effects
- Lesson listing for a paid resource short-circuits to counts unless the viewer purchased (`src/app/api/resources/[id]/lessons/route.ts`).
- Profile publisher stats aggregate purchases and revenue (`src/app/api/profile/content/route.ts`).
- Account merges move purchases to the primary account (`src/lib/account-linking.ts`).
- UI purchase banners/components read `purchases` arrays and treat access as `amountPaid >= price` (cards, course pages, content viewers).

## Edge Cases Already Covered
- Single-receipt reuse across users is blocked (unique column + JSONB containment); multi-receipt aggregation still has a race window—see the uncovered item below.
- Multi-receipt aggregation avoids double-counting already stored receipts in the happy path.
- Anonymous/“private” zaps remain claimable because the `P` tag carries the real pubkey.
- Invoice description hash mismatch halts the flow (guards non-NIP-57 providers).
- Admin-only pathways for `manual/comped/refund` payment types.
- Price mismatch logging when nostr hint differs from DB price (helps audit under/overcharge risks).

## Uncovered / Outstanding Edge Cases
- Late/remote receipts are retried briefly, but there is still no background worker to reconcile after the request returns.
- Users without a linked pubkey cannot claim; logged-out zaps remain unclaimable by design.
- Content missing both `noteId` and owner pubkey cannot be sold (API rejects).
- Race window: JSONB containment check is not atomic with insert; multi-receipt reuse could slip if two claims race on different IDs of the same array.
