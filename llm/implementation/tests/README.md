# Test Coverage Documentation

Index of test files and their coverage. Tests use Vitest with mocking.

## Test Files Overview

| File | Location | Tests | Coverage Area |
|------|----------|-------|---------------|
| [auth.test.ts](./auth-tests.md) | `src/lib/tests/` | 11 | Pubkey validation |
| [account-linking.test.ts](./account-linking-tests.md) | `src/lib/tests/` | ~30 | Provider classification |
| [profile-aggregator.test.ts](./profile-aggregator-tests.md) | `src/lib/tests/` | 2 | Profile merging |
| [pricing.test.ts](./pricing-tests.md) | `src/lib/tests/` | ~25 | Price resolution |
| [anon-reconnect-token.test.ts](./anon-reconnect-token-tests.md) | `src/lib/tests/` | ~15 | Token generation/verification |
| [content-utils.test.ts](./content-utils-tests.md) | `src/lib/tests/` | ~25 | XSS sanitization |
| [publish-service.test.ts](./publish-service-tests.md) | `src/lib/tests/` | 1 | Privkey handling |
| [republish-service.test.ts](./republish-service-tests.md) | `src/lib/tests/` | 2 | Privkey handling |
| [privkey-crypto.test.ts](./privkey-crypto-tests.md) | `src/lib/tests/` | ~10 | AES-256-GCM encryption |
| [oauth-state.test.ts](./oauth-state-tests.md) | `src/lib/tests/` | ~20 | CSRF prevention |
| [account-sync.test.ts](./account-sync-tests.md) | `src/app/api/tests/` | ~10 | Account sync API |
| [profile-sync.test.ts](./profile-sync-tests.md) | `src/app/api/tests/` | 1 | Profile sync API |
| [flush.test.ts](./flush-tests.md) | `src/app/api/views/tests/` | 10 | View counter flush |

## Coverage by Domain

### Security (~70 tests)
- **Authentication**: pubkey validation, NIP-98 verification
- **XSS Prevention**: HTML sanitization, markdown extraction
- **CSRF Prevention**: OAuth state tokens
- **Encryption**: AES-256-GCM for private keys
- **Token Security**: Anonymous reconnect tokens

### Data Integrity (~35 tests)
- **Pricing**: Resolution logic, vulnerability documentation
- **Profile Aggregation**: Merging OAuth + Nostr data
- **Account Linking**: Provider classification, hierarchy

### Race Conditions (10 tests)
- **View Flush**: TOCTOU prevention with GETDEL + INCREMENT

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
1. Integration tests (API → DB → Nostr)
2. NIP-07 browser extension mocking
3. Nostr relay communication
4. Full authentication flow (signin → session → protected routes)
5. Purchase/claim flow
6. View counter increment path

## Related Documentation

- [security-patterns.md](../../context/security-patterns.md) - Security overview
- [authentication-system.md](../../context/authentication-system.md) - Auth details
- [encryption-key-management.md](../../context/encryption-key-management.md) - Key management
