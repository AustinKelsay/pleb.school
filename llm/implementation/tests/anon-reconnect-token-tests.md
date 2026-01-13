# anon-reconnect-token.test.ts

**Location**: `src/lib/tests/anon-reconnect-token.test.ts`
**Tests**: ~15

## Purpose

Tests token generation and verification for anonymous account reconnection.

## Functions Tested

### `generateReconnectToken(userId)`
Creates signed token for reconnecting to anonymous account.

### `verifyReconnectToken(token)`
Validates token and extracts userId.

## Test Coverage

### Token Generation
| Test | Scenario | Expected |
|------|----------|----------|
| Valid userId | Normal ID | Returns token string |
| Empty userId | `""` | Throws error |
| Null userId | `null` | Throws error |

### Token Verification
| Test | Input | Expected |
|------|-------|----------|
| Valid token | Generated token | Returns `{ userId }` |
| Expired token | Token > 30 days old | Returns `null` |
| Tampered signature | Modified token | Returns `null` |
| Wrong format | Random string | Returns `null` |
| Empty string | `""` | Returns `null` |

### Token Structure
| Test | Aspect | Expected |
|------|--------|----------|
| Format | Dot-separated | `payload.signature` |
| Payload | Base64 JSON | `{ userId, exp, iat }` |
| Signature | HMAC-SHA256 | 64 hex chars |

### Expiration
| Test | Age | Expected |
|------|-----|----------|
| Fresh (0 days) | Now | Valid |
| Old (29 days) | 29d ago | Valid |
| Expired (31 days) | 31d ago | Invalid |
| Edge (30 days) | 30d ago | Valid (inclusive) |

## Security Properties

1. **Unforgeability**: HMAC signature prevents token creation without secret
2. **Expiration**: 30-day limit prevents indefinite reuse
3. **Binding**: Token tied to specific userId

## Token Flow

```
Anonymous signup
    ↓
generateReconnectToken(userId)
    ↓
Store in httpOnly cookie + localStorage (dual storage)
    ↓
Browser closed, session expires
    ↓
Return to site
    ↓
verifyReconnectToken(token)
    ↓
If valid: Auto-login to same anonymous account
```

## Related Files

- `src/lib/anon-reconnect-token.ts` - Implementation
- `src/app/api/auth/anon-reconnect/route.ts` - Cookie management
- `src/lib/auth.ts` - Token verification in authorize
- [authentication-system.md](../../context/authentication-system.md) - Auth flow
