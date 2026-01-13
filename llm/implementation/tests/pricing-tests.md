# pricing.test.ts

**Location**: `src/lib/tests/pricing.test.ts`
**Tests**: ~25

## Purpose

Tests `resolvePriceForContent()` which determines canonical price for resources and courses. Includes vulnerability documentation.

## Functions Tested

### `resolvePriceForContent(content, options?)`

Resolves price from multiple sources with defined precedence.

## Price Resolution Order

1. **Database `price` field** (highest priority)
2. **Nostr event `price` tag** (NIP-99)
3. **Default** (0 = free)

## Test Coverage

### Basic Resolution
| Scenario | DB Price | Nostr Price | Result |
|----------|----------|-------------|--------|
| DB price set | 1000 | 500 | 1000 |
| No DB price | null | 500 | 500 |
| No prices | null | null | 0 |
| Zero DB price | 0 | 500 | 0 |

### Edge Cases
| Test | Input | Expected |
|------|-------|----------|
| Negative price | -100 | 0 (clamped) |
| String price | "1000" | 1000 (coerced) |
| NaN price | NaN | 0 |
| Infinity | Infinity | 0 |
| Very large | 999999999 | capped |

### Course Pricing
- Course price applies to entire course
- Individual lesson prices ignored in course context
- Free courses remain free regardless of lesson prices

## Vulnerability Documentation

The test file documents a **theoretical vulnerability** (commented, not exploitable):

```typescript
/**
 * THEORETICAL VULNERABILITY (not currently exploitable):
 * If an attacker could set their own Nostr price tag lower than DB price,
 * and the system used Nostr price, they could bypass payment.
 *
 * MITIGATION: DB price always takes precedence. Nostr price is only
 * used as fallback when DB price is null/undefined.
 */
```

This documents the design decision to trust DB over Nostr for price.

## Mock Strategy

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() }
  }
}))
```

## Related Files

- `src/lib/pricing.ts` - Implementation
- `src/hooks/usePurchaseEligibility.ts` - Uses resolved price
- `src/app/api/purchases/claim/route.ts` - Price verification
