# Test Coverage Documentation

Index of test files and their coverage. Tests use Vitest with mocking.

## Test Files Overview

| File | Location | Tests | Coverage Area |
|------|----------|-------|---------------|
| [auth.test.ts](./auth-tests.md) | `src/lib/tests/` | 11 | Pubkey validation |
| [account-linking.test.ts](./account-linking-tests.md) | `src/lib/tests/` | 40 | Provider classification |
| [profile-aggregator.test.ts](./profile-aggregator-tests.md) | `src/lib/tests/` | 2 | Profile merging |
| [pricing.test.ts](./pricing-tests.md) | `src/lib/tests/` | 22 | Price resolution |
| [anon-reconnect-token.test.ts](./anon-reconnect-token-tests.md) | `src/lib/tests/` | 15 | Token generation/verification |
| [content-utils.test.ts](./content-utils-tests.md) | `src/lib/tests/` | 32 | XSS sanitization |
| [publish-service.test.ts](./publish-service-tests.md) | `src/lib/tests/` | 1 | Privkey handling |
| [republish-service.test.ts](./republish-service-tests.md) | `src/lib/tests/` | 16 | Privkey handling, event persistence, error handling |
| [privkey-crypto.test.ts](./privkey-crypto-tests.md) | `src/lib/tests/` | 11 | AES-256-GCM encryption |
| [oauth-state.test.ts](./oauth-state-tests.md) | `src/lib/tests/` | 19 | CSRF prevention |
| [account-sync.test.ts](./account-sync-tests.md) | `src/app/api/tests/` | 2 | Account sync API |
| [profile-sync.test.ts](./profile-sync-tests.md) | `src/app/api/tests/` | 1 | Profile sync API |
| [flush.test.ts](./flush-tests.md) | `src/app/api/views/tests/` | 10 | View counter flush |

## Coverage by Domain

### Security (91 tests)
- **Authentication**: pubkey validation, NIP-98 verification (11 tests)
- **XSS Prevention**: HTML sanitization, markdown extraction (32 tests)
- **CSRF Prevention**: OAuth state tokens (19 tests)
- **Encryption**: AES-256-GCM for private keys (11 tests)
- **Token Security**: Anonymous reconnect tokens (15 tests)
- **Privkey Handling**: Plaintext rejection in publish/republish (3 tests: 1 publish + 2 republish)

### Data Integrity (81 tests)
- **Pricing**: Resolution logic, vulnerability documentation (22 tests)
- **Profile Aggregation**: Merging OAuth + Nostr data (2 tests)
- **Account Linking**: Provider classification, hierarchy (40 tests)
- **Account/Profile Sync**: API endpoints for syncing data (3 tests: 2 account-sync + 1 profile-sync)
- **Republish Logic**: Event persistence, lesson handling, error scenarios (14 tests)

### Race Conditions (10 tests)
- **View Flush**: TOCTOU prevention with GETDEL + INCREMENT (10 tests)

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test src/lib/tests/auth.test.ts

# Run with coverage
npm test -- --coverage
```

## Test Patterns

### Mocking Strategy
Tests mock external dependencies:
- `@/lib/prisma` - Database operations
- `next-auth` - Session management
- `@/lib/nostr-relays` - Relay configuration
- `@/lib/nostr-events` - Event creation

### Environment Variables
Many tests manipulate `process.env`:
- `PRIVKEY_ENCRYPTION_KEY` - Encryption key tests
- `NODE_ENV` - Development vs production behavior

## Known Gaps

Areas lacking test coverage:

### 1. Integration Tests (API → DB → Nostr)
End-to-end tests that exercise full request lifecycle with real database operations.

### 2. NIP-07 Browser Extension Mocking
Client-side tests for `window.nostr` signing flows.

### 3. Nostr Relay Communication
Tests for relay publish/subscribe, retry logic, and relay hint handling.

### 4. Full Authentication Flow
Beyond `verifyNostrPubkey` format checks, tests needed for:
- Signin → session creation → session persistence
- Protected route access with valid/invalid/expired sessions
- OAuth callback handling and account linking
- Anonymous account creation and reconnect token flow

### 5. Purchase/Claim Flow (`/api/purchases/claim`)
The 800+ line claim route needs integration tests covering:
- **Signature verification**: Valid/invalid zap receipt signatures, zap request signatures
- **Replay protection**: Duplicate `zapReceiptId` rejection, JSONB containment checks
- **Receipt age limits**: 24-hour default, extended 1-year window with `allowPastZaps`, `MAX_RECEIPT_AGE_MS` env override
- **Pricing validation**: `resolvePriceForContent()` DB vs Nostr price, snapshot pricing (`priceAtPurchase` vs current price)
- **Payer matching**: Session pubkey, derived pubkey, `P` tag for privacy mode
- **Multi-receipt aggregation**: Incremental `amountPaid` updates, receipt merging
- **Admin-only paths**: `manual`, `comped`, `refund` payment types with `isAdmin` check
- **Edge cases**: Missing `noteId`, no linked pubkey, relay fetch failures/retries

### 6. View Counter Increment Path
Tests for the increment → flush → persist cycle with race condition scenarios.

## Related Documentation

- [security-patterns.md](../../context/security-patterns.md) - Security overview
- [authentication-system.md](../../context/authentication-system.md) - Auth details
- [encryption-key-management.md](../../context/encryption-key-management.md) - Key management
