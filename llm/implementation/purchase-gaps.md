# Purchase Zap Flow Gaps (open) — 2025-11-25

## 1) Receipt-required unlocks (design choice)
- We now credit purchases only when a zap receipt is verified. If receipts are delayed or only on distant relays, users must retry once they arrive.
- Mitigation ideas: background worker to poll relays with wider fan-out; enqueue pending claims and reconcile when receipts land; or show clearer UI prompting a retry with relay hints.

## 2) Multi-receipt race window
- JSONB containment checks are not atomic; concurrent claims with different receipt IDs from the same payment set could both pass before the write. Unique `zapReceiptId` prevents single-receipt reuse, but multi-receipt arrays remain theoretically vulnerable.
- Mitigation ideas: add a dedicated `PurchaseReceipt` table with unique `(receiptId)`; or wrap claims in an advisory lock keyed by receiptId; or add a generated column of flattened receipt IDs with a unique index.

## 3) Price mismatch visibility
- When DB and Nostr price hints diverge we log and enforce DB price, but the UI can still show a stale/hinted price until refresh. Users may perceive over/undercharge.
- Mitigation ideas: surface a “price verified” badge bound to DB price; force client refresh of price on dialog open; or block checkout if the hinted price differs by > threshold and prompt a reload.

## 4) Auto-claim depends on live zap feed
- Eligibility/auto-claim rely on `viewerZapTotalSats` derived from receipts visible to the current browser session. Zaps sent from other clients on relays we don’t subscribe to won’t trigger auto-claim; user must manually claim with receipt IDs or inline receipts.
- Mitigation ideas: fetch user zap receipts server-side via relay fan-out; persist last-seen receipts per user/content; or add a “retry claim” button that queries a broader relay set.
