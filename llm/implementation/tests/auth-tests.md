# auth.test.ts Documentation

**Location**: `src/lib/tests/auth.test.ts`
**Tests**: 11

## Purpose

Tests `verifyNostrPubkey()` function which validates Nostr public keys before authentication.

## Test Coverage

### Valid Pubkey Formats

| Test | Input | Expected |
|------|-------|----------|
| Valid 64-char hex | `"a".repeat(64)` | Valid |
| Mixed case hex | `"aAbBcCdDeEfF..."` | Valid (normalized to lowercase) |

**Note:** The auth flow uses `normalizeHexPubkey()` to normalize pubkeys to lowercase (per NIP-01) before storage and comparison. This ensures consistency with Nostr event pubkeys which are always lowercase.

### Invalid Pubkey Rejection

| Test | Input | Reason |
|------|-------|--------|
| Empty string | `""` | Empty |
| 63 characters | `"a".repeat(63)` | Too short |
| 65 characters | `"a".repeat(65)` | Too long |
| Non-hex characters | `"g".repeat(64)` | Invalid chars |
| Spaces | `" ".repeat(64)` | Invalid chars |
| npub format | `"npub1..."` | Wrong format (bech32) |
| nsec format | `"nsec1..."` | Wrong format (private key) |
| null | `null` | Null input |
| undefined | `undefined` | Undefined input |

## Security Relevance

This validation runs before NIP-98 signature verification to:
1. Reject obviously invalid pubkeys early
2. Prevent processing malformed input
3. Ensure pubkey matches expected hex format

## Dependencies

None - pure validation function.

## Related Files

- `src/lib/auth.ts:verifyNostrPubkey()` - Implementation
- [authentication-system.md](../../context/authentication-system.md) - Auth flow
