# Zap Flow Reference

## Inputs & Dependencies
- **Component entrypoint**: `src/components/ui/interaction-metrics.tsx` renders the Zap dialog inline inside metrics row.
- **Core hook**: `useZapSender` (`src/hooks/useZapSender.ts`) handles LNURL resolution, zap request signing, invoice fetching, WebLN attempts, and status transitions.
- **Upstream data**: `useInteractions` supplies `zapInsights`, `recentZaps`, `hasZappedWithLightning`, and `viewerZapTotalSats`.
- **Props needed for full context**: `eventId`/`eventKind`/`eventIdentifier`/`eventPubkey` (for receipts and context) plus `zapTarget` (Lightning recipient hints). Zaps can still be sent without event metadata, but receipts/analytics are reduced.

## User-Facing Behaviors (must remain functional)
1. **Amount selection**
   - Quick buttons are driven by `paymentsConfig.zap.quickAmounts` (default `[21, 100, 500, 1000, 2100]`) and `defaultQuickIndex`.
   - Custom numeric input enforces `MIN_CUSTOM_ZAP` and LNURL `minSendable`/`maxSendable` with inline errors + toasts.
2. **Note entry**
   - Optional textarea capped by LNURL `commentAllowed` (bytes); falls back to `paymentsConfig.zap.noteMaxBytes` (default `280`).
   - Uses `getByteLength` + `truncateToByteLength` to enforce byte limits; `useZapSender` also trims notes to 280 chars before signing.
3. **Zap send pipeline**
   - Session is **not strictly required**: signing path is chosen from (a) server-stored privkey, (b) NIP-07 extension, or (c) generated anonymous keypair (used when privacy mode is enabled **or** no other signer is available).
   - Resolves lightning address / LNURL from `zapTarget` or fetched profile (cached per pubkey).
   - `zapState.status` transitions: `idle → resolving → signing → requesting-invoice → invoice-ready → paying → success|error` with UI status map.
   - Zap request signing merges `zapTarget.relayHints` with configured relays.
   - LNURL callback invoked with encoded zap request; rejects invoices missing description hash or with hash mismatch (NIP-57 mandatory).
   - Attempts WebLN automatically; exposes retry + error string, and always surfaces invoice for manual pay.
4. **Invoice handling**
   - Show bolt11 string, allow copy-to-clipboard with toast, and `lightning:` deep link.
   - QR auto-reveals when `paymentsConfig.zap.autoShowQr` is true.
5. **Status + toast coverage**
   - Toasts for success/invoice-ready, min/max violations, clipboard errors, reaction gating, WebLN retry results, etc.
6. **Analytics + context**
   - Display aggregated stats (total sats, supporters, average zap, last zap age) and viewer summary.
   - Preview up to `paymentsConfig.zap.recentZapsLimit` receipts with sats, sender snippet, note, and relative timestamp.
7. **Cleanup**
   - Closing dialog resets local form state and zap hook state to `idle` while preserving parent metrics.

## Non-Goals For Current Refactor
- Do not alter `useZapSender` networking logic, LNURL cache strategy, or `useInteractions` subscription behavior.
- Keep ZapThreads widget untouched; this work only affects the modal flow triggered from interaction metrics.

Use this document as the parity checklist after restructuring the modal.
