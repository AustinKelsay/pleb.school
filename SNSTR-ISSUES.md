# SNSTR Package Issues

**Package:** `snstr`
**Version:** `0.1.10` → **Resolved in `0.2.0`**
**Project:** pleb.school
**Date:** 2026-01-22
**Status:** ✅ RESOLVED

---

## Issue 1: Ephemeral Relay Not Exported

### Problem

The `NostrRelay` class from `snstr/dist/src/utils/ephemeral-relay` was not accessible due to the package's strict `exports` field in `package.json`.

### Error Message

```
Error: Package subpath './dist/src/utils/ephemeral-relay' is not defined by "exports"
in /path/to/node_modules/snstr/package.json
```

### Context

We use the ephemeral relay for integration testing of Nostr publishing functionality. It provides an in-memory relay that tests can publish to and verify events against without external dependencies.

---

## Resolution

**Fixed in snstr 0.2.0** - The package now exports `./utils/ephemeral-relay`.

### Updated Import

```typescript
// src/lib/tests/utils/ephemeral-relay.ts
import { NostrRelay } from "snstr/utils/ephemeral-relay"
```

### Package Update

```bash
npm install snstr@^0.2.0
```

---

## Impact (Resolved)

All integration tests for Nostr publishing functionality now work correctly:
- `PublishService` - publishing drafts to Nostr relays ✅
- Event signing and relay communication ✅
- End-to-end publish flows ✅

Tests using the ephemeral relay:
- `republish-service.test.ts`
- `prisma-v7-*.test.ts` (4 test files, 56 tests total)

---

## Environment

- Node.js: v22.x
- Vitest: 4.0.16
- snstr: 0.2.0 (upgraded from 0.1.10)
