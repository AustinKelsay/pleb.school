# Issue: CSP blocks configured Nostr relays

- **Location**: `middleware.ts` Content-Security-Policy sets `connect-src` to `wss://relay.nostr.band wss://nos.lol wss://relay.damus.io` only.
- **Impact**: Relays declared in `config/nostr.json` (primal.net, nostr.land, purplerelay.com, nostr.wine, etc.) are blocked in production; relay pool connections fail, so fetching/publishing Nostr events becomes unreliable.
- **Risk**: Broken real-time content, missing notes, failed zap threads, and inconsistent client behavior between dev and prod.
- **Recommended fix**:
  1. Build `connect-src` from the union of relay sets in `config/nostr.json` (default/content/profile/zapThreads), deduped.
  2. Keep localhost allowances for dev and add an escape hatch via `ALLOWED_RELAYS` env var if needed.
  3. Add a unit/integration assertion in middleware to ensure at least one relay from config is present in `connect-src`.

