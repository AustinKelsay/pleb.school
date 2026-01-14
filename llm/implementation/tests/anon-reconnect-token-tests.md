# anon-reconnect-token.test.ts

**Location**: `src/lib/tests/anon-reconnect-token.test.ts`
**Tests**: ~15

## Purpose

Tests token generation and verification for anonymous account reconnection.

## Functions Tested

### `generateReconnectToken()`
Generates a new random reconnect token and its SHA-256 hash. Returns an object with `{ token, tokenHash }` where `token` is a 64-character hex string (256-bit random) for client storage, and `tokenHash` is the SHA-256 hash for database storage.

### `hashToken(token)`
Hashes a plaintext token using SHA-256. Returns a 64-character hex string. Used internally by `generateReconnectToken()` and for computing hashes during token verification.

### `verifyToken(token, storedHash)`
Verifies a plaintext token against a stored hash using constant-time comparison to prevent timing attacks. Returns `true` if the token matches the hash, `false` otherwise. Takes two parameters: the token from the client and the hash stored in the database.

## Test Coverage

### Token Generation
| Test | Scenario | Expected |
|------|----------|----------|
| Generates token and hash pair | Normal call | Returns `{ token, tokenHash }` |
| Unique tokens | Multiple calls | Each token is different |
| Token format | Generated token | 64-character hex string (256-bit) |
| Hash format | Generated hash | 64-character hex string (SHA-256) |

### Token Hashing
| Test | Scenario | Expected |
|------|----------|----------|
| Consistent hashing | Same input | Same hash output |
| Different hashes | Different inputs | Different hash outputs |
| Hash format | Any token | 64-character hex string (SHA-256) |

### Token Verification
| Test | Input | Expected |
|------|-------|----------|
| Matching token and hash | Valid pair | Returns `true` |
| Wrong token | Token doesn't match hash | Returns `false` |
| Wrong hash | Hash doesn't match token | Returns `false` |
| Empty token | `""` | Returns `false` |
| Empty hash | `""` | Returns `false` |
| Null/undefined inputs | Invalid types | Returns `false` |

### Token Structure
| Test | Aspect | Expected |
|------|--------|----------|
| Token format | Random hex | 64-character hex string |
| Hash format | SHA-256 | 64-character hex string |
| No expiration | Token itself | No expiration logic in token |
| No payload | Token structure | Simple random token, not JWT-like |

## Security Properties

1. **Unforgeability**: Random 256-bit tokens cannot be guessed or derived
2. **Hash-only storage**: Database stores only SHA-256 hash, not plaintext token
3. **Token rotation**: Token rotates on every successful authentication (limits stolen token window)
4. **Constant-time comparison**: `verifyToken` uses `crypto.timingSafeEqual` to prevent timing attacks
5. **O(1) lookup**: Direct database lookup by hash using unique index (no iteration needed)

## Token Flow

```
Anonymous signup
    ↓
generateReconnectToken() → { token, tokenHash }
    ↓
Store token in httpOnly cookie + localStorage (dual storage)
Store tokenHash in database (anonReconnectTokenHash field)
    ↓
Browser closed, session expires
    ↓
Return to site
    ↓
Client sends token → Server computes hashToken(token)
    ↓
Direct O(1) lookup: findUnique({ where: { anonReconnectTokenHash: computedHash } })
    ↓
If found: Auto-login to same anonymous account + rotate token
```

## Related Files

- `src/lib/anon-reconnect-token.ts` - Implementation
- `src/app/api/auth/anon-reconnect/route.ts` - Cookie management
- `src/lib/auth.ts` - Token verification in authorize
- [authentication-system.md](../../context/authentication-system.md) - Auth flow
