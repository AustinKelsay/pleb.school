# oauth-state.test.ts

**Location**: `src/lib/tests/oauth-state.test.ts`
**Tests**: ~20

## Purpose

Tests CSRF prevention for OAuth flows using state parameter.

## Functions Tested

### `createSignedState(data)`
Creates signed state token for OAuth redirect.

### `verifySignedState(state)`
Validates state token and extracts data.

## Test Coverage

### State Generation

| Test | Input | Expected |
|------|-------|----------|
| Basic data | `{ provider: "github" }` | Returns state string |
| With callback | `{ provider: "github", callbackUrl: "/profile" }` | Includes callback |
| Empty object | `{}` | Returns state string |

### State Verification

| Test | Input | Expected |
|------|-------|----------|
| Valid state | Generated state | Returns original data |
| Tampered signature | Modified state | Returns null |
| Expired state | State > 10 min old | Returns null |
| Wrong format | Random string | Returns null |
| Empty string | `""` | Returns null |

### CSRF Prevention

| Test | Scenario | Expected |
|------|----------|----------|
| Cross-site state | State from different origin | Rejected |
| Replay attack | Same state used twice | Second use rejected |

### Expiration

| Test | Age | Expected |
|------|-----|----------|
| Fresh | 0 min | Valid |
| Old | 9 min | Valid |
| Expired | 11 min | Invalid |
| Edge | 10 min | Valid (inclusive) |

## State Token Structure

```typescript
{
  data: { provider, callbackUrl, ... },
  exp: timestamp,
  iat: timestamp
}
```

Encoded as: `base64(JSON).signature`

## CSRF Attack Prevention

Without state parameter:
```
1. Attacker starts OAuth flow
2. Gets authorization code
3. Tricks victim into completing flow
4. Victim's account linked to attacker's OAuth
```

With state parameter:
```
1. Server generates state tied to user's session
2. State included in OAuth redirect
3. Callback verifies state matches
4. Cross-site requests fail verification
```

## Mock Strategy

Tests don't require mocks - pure crypto functions.

## Related Files

- `src/lib/oauth-state.ts` - Implementation
- `src/app/api/auth/[...nextauth]/route.ts` - OAuth callbacks
- [security-patterns.md](../../context/security-patterns.md) - Security overview
