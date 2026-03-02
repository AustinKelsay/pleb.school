# Purchase Zap Flow Gaps (open) — 2026-01-16

## 1) Receipt-required unlocks (design choice)
- We now credit purchases only when a zap receipt is verified. If receipts are delayed or only on distant relays, users must retry once they arrive.
- Mitigation ideas: background worker to poll relays with wider fan-out; enqueue pending claims and reconcile when receipts land; or show clearer UI prompting a retry with relay hints.

## 2) Multi-receipt race window
- JSONB containment checks are not atomic; concurrent claims with different receipt IDs from the same payment set could both pass before the write. Unique `zapReceiptId` prevents single-receipt reuse, but multi-receipt arrays remain theoretically vulnerable.
- Mitigation ideas: add a dedicated `PurchaseReceipt` table with unique `(receiptId)`; or wrap claims in an advisory lock keyed by receiptId; or add a generated column of flattened receipt IDs with a unique index.

## 3) Price mismatch visibility
- When DB and Nostr price hints diverge we log and enforce DB price, but the UI can still show a stale/hinted price until refresh. Users may perceive over/undercharge.
- Mitigation ideas: surface a "price verified" badge bound to DB price; force client refresh of price on dialog open; or block checkout if the hinted price differs by > threshold and prompt a reload.

## 4) Auto-claim/feed coupling (partially mitigated)
- **Improved**: interaction subscriptions on detail/purchase surfaces now run realtime and use broader relay coverage (`default + zapThreads + relayHints`), reducing "refresh required" cases.
- **Now**: the purchase dialog now runs a bounded background claim loop after invoice creation, so manual/external wallet payments can unlock when receipts propagate.
- **Adds**: a claim API invoice-scoped receipt lookup fallback (content/recipient-scoped scan + `bolt11` match) when receipt IDs are not yet present in the client payload.
- **Uses**: stable invoice polling timeout and cleanup guards so in-flight poll responses can no longer trigger duplicate unlock toasts/callbacks after dialog cleanup/unmount.
- Remaining gap: there is still no durable background worker to reconcile receipts after the user leaves/closes the page.
- **Receipt age limit**: ~~The server previously had a hardcoded 24-hour receipt age limit that blocked "Unlock with past zaps" for older receipts.~~ **FIXED**: The claim route now supports `allowPastZaps: boolean` which extends the age limit to 1 year for the manual unlock flow. The default 24-hour limit remains for fresh zap claims (defense-in-depth). Configurable via `MAX_RECEIPT_AGE_MS` env var.
