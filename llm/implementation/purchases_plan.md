# Purchases Implementation Plan (Implemented)

Author: Codex
Last Updated: 2026-01-11
Status: Implemented; keep this as historical context. For current behavior, see `llm/context/purchases-and-zaps.md` and `llm/implementation/purchases-zaps.md`.

## Product Truths (still valid)
- All payments are NIP-57 zaps; any zap can satisfy a purchase if the payer can be tied to the account (pubkey or `P` tag).
- Sum of a viewer's zaps for a piece of content counts toward the sticker price; once total ≥ price, create/merge a `Purchase`.
- Use the existing `Purchase` model (now includes audit fields like receipts/invoice). No extra tables required.
- Purchases require authentication; logged-out zaps are tips unless the user later logs in with a matching pubkey and submits receipts.

## Current State Snapshot (2026-01-11)
- `POST /api/purchases/claim` verifies zap receipts, enforces DB price, stores `priceAtPurchase`, `zapReceiptJson`, `zapRequestJson`, and dedupes receipts.
- `usePurchaseEligibility` auto-claims when `viewerZapTotalSats ≥ price`; `PurchaseDialog` drives the zap flow + manual claim retry.
- `useZapSender` supports server-side signing, NIP-07, and optional anonymous privacy mode; zaps can be sent without auth if a signer is available.
- Resource/course APIs gate paid content with snapshot-aware checks and `requiresPurchase`; course purchases can unlock lesson resources.

---

## POST /api/purchases/claim - API Reference

### Authentication
Requires authenticated session. Returns `401 Unauthorized` if not logged in.

### Request Body Schema

```typescript
// Zod validation schema (from route.ts)
{
  // Content identifier (exactly one required)
  resourceId?: string,       // UUID of resource to claim
  courseId?: string,         // UUID of course to claim (mutually exclusive with resourceId)

  // Payment details
  amountPaid: number,        // Required. Total sats paid (client-provided, server re-verifies)
  paymentType?: "zap" | "manual" | "comped" | "refund",  // Default: "zap"

  // Zap receipt identifiers (at least one receipt required for type "zap")
  zapReceiptId?: string,     // Single receipt event ID (64-char hex)
  zapReceiptIds?: string[],  // Multiple receipt IDs for aggregated zaps

  // Full receipt events (optional, avoids relay fetch if provided)
  zapReceiptJson?: NostrEvent | NostrEvent[],  // Kind 9735 receipt event(s)
  zapRequestJson?: NostrEvent,                 // Kind 9734 request event

  // Invoice/payment proof
  invoice?: string,          // bolt11 invoice string (used as hint for single-receipt claims)
  // Note: paymentPreimage was removed - was accepted but never stored or validated

  // Price hints
  nostrPrice?: number,       // Client's view of price (IGNORED - DB price is authoritative)
  zapTotalSats?: number,     // Client's total zap amount (context only, not persisted)

  // Relay hints for receipt fetch
  relayHints?: string[]      // Additional relays to search for receipts
}
```

### NostrEvent Shape (for zapReceiptJson/zapRequestJson)

```typescript
interface NostrEvent {
  id: string,           // 64-char lowercase hex event ID
  pubkey: string,       // 64-char lowercase hex pubkey
  created_at: number,   // Unix timestamp (seconds)
  kind: number,         // 9735 for receipt, 9734 for request
  tags: string[][],     // Event tags (must include bolt11, description, p, e/a)
  content: string,      // Usually empty for zap events
  sig: string           // 128-char hex Schnorr signature
}
```

### Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `resourceId` / `courseId` | Exactly one required | `"Provide either resourceId or courseId"` |
| `amountPaid` | Non-negative integer | Zod validation error |
| `zapReceiptId` | 64-char hex (if provided) | Receipt fetch fails |
| `invoice` | Valid bolt11 (if provided) | `"Unable to read amount from zap invoice"` |
| Zap receipt signature | Must verify with `snstr.verifySignature` | `"Zap receipt signature is invalid"` |
| Zap request signature | Must verify | `"Zap request signature is invalid"` |
| Receipt `p` tag | Must match content owner's pubkey | `"Zap recipient does not match this content"` |
| Receipt `e`/`a` tag | Must match content's noteId | `"Zap receipt is not for this content"` |
| Zap payer pubkey | Must match session user's pubkey | `"Zap receipt sender does not match your account"` |
| Invoice description hash | Must match SHA256 of zap request JSON | `"Invoice description hash does not match zap request"` |
| DB price source | Must be `"database"`, not `"nostr"` | `"Content price could not be verified from the database"` |

### Success Response (200 OK)

```typescript
{
  success: true,
  data: {
    purchase: {
      id: string,                    // UUID of purchase record
      userId: string,                // UUID of purchasing user
      courseId: string | null,       // UUID if course purchase
      resourceId: string | null,     // UUID if resource purchase
      amountPaid: number,            // Total sats credited (server-verified)
      priceAtPurchase: number,       // Price snapshot at claim time
      paymentType: string,           // "zap" | "manual" | "comped" | "refund"
      zapReceiptId: string | null,   // First receipt ID
      invoice: string | null,        // bolt11 invoice
      zapReceiptJson: object | null, // Full receipt event(s) for audit
      zapRequestJson: object | null, // Zap request event
      createdAt: string,             // ISO timestamp
      updatedAt: string              // ISO timestamp
    },
    created: boolean,          // true if new purchase, false if updated existing
    alreadyOwned: boolean,     // true if purchase existed before this call
    amountCredited: number,    // Total sats now credited to this purchase
    priceSats: number,         // Resolved price from database
    zapTotalSats?: number      // Echo of client-provided total (if sent)
  }
}
```

### Error Responses

| HTTP Code | Error Key | When | Retryable |
|-----------|-----------|------|-----------|
| **400** | `"Provide either resourceId or courseId"` | Missing/both content IDs | No |
| **400** | `"Validation failed"` | Zod schema violation | No |
| **400** | `"Zap receipt not found on relays..."` | Receipt not published yet | Yes (after delay) |
| **400** | `"Zap receipt signature is invalid"` | Forged/corrupt receipt | No |
| **400** | `"Zap recipient does not match this content"` | Wrong content zapped | No |
| **400** | `"Zap receipt sender does not match your account"` | Claiming someone else's zap | No |
| **400** | `"Content price could not be verified..."` | DB has no price (price source protection) | No (config issue) |
| **400** | `"Link a Nostr pubkey to your account..."` | User has no pubkey for zap matching | No (user action needed) |
| **401** | `"Authentication required"` | No session | No (login required) |
| **403** | `"Only admins can record non-zap purchases"` | Non-admin trying manual/comped | No |
| **404** | `"Content not found"` | Invalid resourceId/courseId | No |
| **404** | `"Related content not found..."` | FK constraint failed | No |
| **409** | `"Purchase already exists"` | Unique constraint (race condition) | Yes (idempotent) |
| **409** | `"zapReceiptId already used by another user"` | Receipt stolen/reused | No |
| **500** | `"Failed to claim purchase"` | Server error | Yes |

### Error Response Shape

```typescript
{
  error: string,          // Human-readable error message
  details?: any           // Additional context (Zod issues, etc.)
}
```

---

## Edge-Case Behaviors

### Receipt Deduplication (Idempotent)

When a receipt ID is already stored on an existing purchase:
1. If it belongs to the **same user**: Returns existing purchase with `created: false, alreadyOwned: true`
2. If it belongs to a **different user**: Returns `409` with `"zapReceiptId already used by another user"`
3. Dedupe checks both `zapReceiptId` column AND nested IDs in `zapReceiptJson` array

**Client handling**: Safe to retry; successful claims are idempotent.

### Aggregated Zaps (Multiple Receipts)

When `zapReceiptIds` contains multiple IDs:
1. Each receipt is validated independently
2. Amounts are summed: `verifiedAmountSats = sum(all_receipt_amounts)`
3. All receipts stored in `zapReceiptJson` as array
4. If **any** receipt fails validation, entire claim is rejected
5. If purchase exists, only **new** receipts (not already stored) are credited

### Price Source Protection

The `nostrPrice` field is **informational only**. The API:
1. Resolves price via `resolvePriceForContent()` which checks DB first
2. If `priceSource === "nostr"` (DB had no price), claim is **rejected**
3. This prevents attackers from submitting `nostrPrice: 0` to bypass payment

**Error**: `"Content price could not be verified from the database. This content may not be properly configured for purchases."`

### Concurrent Claim Race Conditions

The API uses `Prisma.TransactionIsolationLevel.Serializable` to prevent:
- Double-crediting the same receipts
- Creating duplicate purchase rows
- Race conditions between receipt validation and purchase creation

If a race occurs, one request wins and the other gets `409` (safe to retry).

---

## Client Integration Guide

### usePurchaseEligibility Hook

```typescript
const { eligible, status, purchase, error, claimPurchase, resetError } = usePurchaseEligibility({
  resourceId,           // or courseId
  priceSats,            // Content price in sats
  viewerZapTotalSats,   // Sum of viewer's zaps to this content
  alreadyPurchased,     // Skip if already owned
  autoClaim: true,      // Auto-claim when eligible (default)
  zapReceipts,          // From useInteractions hook
  eventId,              // Content's Nostr event ID
  eventPubkey,          // Content owner's pubkey
})
```

### Interpreting API Errors

```typescript
// In claimPurchase catch block:
const body = await res.json().catch(() => ({}))
const errorMessage = body?.error || "Purchase claim failed"

// Retryable errors (status >= 500 or specific messages)
const isRetryable =
  res.status >= 500 ||
  errorMessage.includes("not found on relays") ||
  errorMessage.includes("Purchase already exists")

// User-actionable errors
const needsUserAction =
  errorMessage.includes("Link a Nostr pubkey") ||
  errorMessage.includes("Sign in") ||
  errorMessage.includes("not match your account")

// Fatal errors (don't retry)
const isFatal =
  errorMessage.includes("signature is invalid") ||
  errorMessage.includes("already used by another user") ||
  errorMessage.includes("price could not be verified")
```

### PurchaseDialog Error Handling

| Error Type | UI Behavior |
|------------|-------------|
| Retryable (`status >= 500`) | Show "Try again" button, auto-retry after cooldown |
| Receipt not found | Show "Waiting for receipt..." with spinner, retry after 5s |
| User action needed | Show specific message, disable retry, prompt action |
| Fatal | Show error, no retry option |

### Auto-Claim Backoff

The hook implements exponential backoff on failures:
- Initial cooldown: 5 seconds after failure
- Warning logged every 3 consecutive failures
- Resets on success or session change

## Workstreams & Steps (Implemented)

### 1) Entitlement detection from zaps
- Implemented via `useInteractions` (viewer receipts + totals) and `usePurchaseEligibility` (auto-claim + cooldown/backoff).

### 2) Purchase persistence API (no new tables)
- Implemented in `src/app/api/purchases/claim/route.ts` with receipt validation, dedupe, and upsert semantics.

### 3) Purchase modal & CTA
- Implemented in `src/components/purchase/purchase-dialog.tsx` with QR, privacy toggle, progress, and auto-claim hooks.

### 4) Non-auth zap path
- Supported when NIP-07 is available or privacy mode is enabled; no purchase is recorded without a session.

### 5) Price harmonization & lookup
- Implemented in `src/lib/pricing.ts` (`resolvePriceForContent`); DB price is authoritative, mismatches are logged.

### 6) Smoke tests to keep running
- OAuth user: zap to unlock, purchase row recorded, gated content opens without refresh.
- NIP-07 user: privacy-mode zap, invoice paid, purchase recorded and unlocked.
- Off-platform zap claim: send from another client, then claim with receipts when logged in.
- Logged-out zap: succeeds as a tip, but cannot claim without an authenticated session.
- Price mismatch: Nostr price differs from DB; DB price enforced and mismatch logged.

## Open Questions / Decisions (resolved)
- Receipt storage: implemented (`zapReceiptId`, `zapReceiptJson`, `invoice`, `paymentType`, `priceAtPurchase`).
- Logged-out zaps: treated as tips only; no latent claim tokens.
- Invoice confirmation: receipt verification required; WebLN success alone does not unlock content.
