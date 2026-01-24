# Payments Configuration

Deep-dive reference for `config/payments.json` - zap presets, purchase dialog behavior, and payment icons.

## File Location

```text
config/payments.json
```

## Accessor File

```text
src/lib/payments-config.ts
```

## Schema Overview

```json
{
  "icons": { "interactions": {}, "status": {}, "purchase": {} },
  "zap": {
    "quickAmounts": [],
    "defaultQuickIndex": 0,
    "minCustomZap": 1,
    "noteMaxBytes": 280,
    "privacyToggle": {},
    "recentZapsLimit": 8,
    "autoShowQr": true
  },
  "purchase": {
    "minZap": 500,
    "autoCloseMs": 1200,
    "autoShowQr": true,
    "progressBasis": "server",
    "noteMaxBytes": 280
  },
  "_comments": {}
}
```

## Icons Configuration

### interactions

Icons for content interaction buttons.

| Key | Default | Description |
|-----|---------|-------------|
| `zap` | `"Zap"` | Lightning zap button |
| `heart` | `"Heart"` | Like/favorite button |
| `comment` | `"MessageCircle"` | Comment button |

### status

Icons for payment status indicators.

| Key | Default | Description |
|-----|---------|-------------|
| `success` | `"CircleCheck"` | Payment successful |
| `pending` | `"Loader2"` | Payment in progress |
| `error` | `"TriangleAlert"` | Payment failed |

### purchase

Icons for purchase-related UI.

| Key | Default | Description |
|-----|---------|-------------|
| `shieldCheck` | `"ShieldCheck"` | Security indicator |
| `wallet` | `"Wallet"` | Wallet icon |

## Zap Configuration

### quickAmounts

Array of preset zap amounts in sats:

```json
[21, 100, 500, 1000, 2100]
```

These appear as quick-select buttons in the zap dialog.

### defaultQuickIndex

Zero-based index of the default selected preset:

```json
1
```

With `quickAmounts: [21, 100, 500, 1000, 2100]` and `defaultQuickIndex: 1`, the 100 sats button is pre-selected.

### minCustomZap

Minimum sats for custom zap input:

```json
1
```

### noteMaxBytes

Maximum bytes allowed in zap note message:

```json
280
```

Fallback when event metadata doesn't specify a limit.

### privacyToggle

Controls visibility of the "Private zap" toggle:

```json
{
  "enabled": true,
  "requireAuth": true,
  "hideWhenPrivkeyPresent": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Show the privacy toggle at all |
| `requireAuth` | boolean | Only show when user is authenticated |
| `hideWhenPrivkeyPresent` | boolean | Hide when user has ephemeral keys (`session.user.hasEphemeralKeys` is true) |

### recentZapsLimit

Number of recent zaps to show in sidebar:

```json
8
```

### autoShowQr

Automatically reveal QR code when invoice is created:

```json
true
```

## Purchase Configuration

### minZap

Minimum sats enforced in the purchase dialog:

```json
500
```

Fallback if `NEXT_PUBLIC_MIN_ZAP_SATS` env var is absent.

### autoCloseMs

Delay in milliseconds before auto-closing dialog after successful claim:

```json
1200
```

### autoShowQr

Automatically reveal QR code for purchase invoice:

```json
true
```

### progressBasis

How to compute purchase progress toward unlock:

```json
"server"
```

| Value | Description |
|-------|-------------|
| `"server"` | Only count zaps recorded on server |
| `"serverPlusViewer"` | Also count viewer's pending zaps |

### noteMaxBytes

Maximum bytes for purchase dialog zap note:

```json
280
```

## Validation

The config is validated at import time using Zod schema. Invalid values will cause a parse error.

```typescript
const ProgressBasisSchema = z.enum(["server", "serverPlusViewer"])

const PaymentsConfigSchema = z.object({
  zap: z.object({
    quickAmounts: z.array(z.number().positive()),
    defaultQuickIndex: z.number().int().min(0),
    minCustomZap: z.number().positive(),
    noteMaxBytes: z.number().int().positive(),
    autoShowQr: z.boolean(),
    privacyToggle: z.object({
      enabled: z.boolean(),
      requireAuth: z.boolean(),
      hideWhenPrivkeyPresent: z.boolean()
    }),
    recentZapsLimit: z.number().int().positive()
  }),
  purchase: z.object({
    minZap: z.number().positive(),
    autoCloseMs: z.number().int().positive(),
    autoShowQr: z.boolean(),
    progressBasis: ProgressBasisSchema,
    noteMaxBytes: z.number().int().positive()
  })
})

export type ProgressBasis = z.infer<typeof ProgressBasisSchema>
export type PaymentsConfig = z.infer<typeof PaymentsConfigSchema>
```

## Usage Examples

### Get Config

```typescript
import { paymentsConfig, getPaymentsConfig } from '@/lib/payments-config'

// Direct access
const quickAmounts = paymentsConfig.zap.quickAmounts
const minPurchase = paymentsConfig.purchase.minZap

// Via function
const config = getPaymentsConfig()
```

### Get Icons

```typescript
import {
  getInteractionIcon,
  getPaymentStatusIcon,
  getPurchaseIcon
} from '@/lib/payments-config'

const ZapIcon = getInteractionIcon('zap')
const SuccessIcon = getPaymentStatusIcon('success')
const WalletIcon = getPurchaseIcon('wallet')

// Usage
<ZapIcon className="h-5 w-5 text-yellow-500" />
```

### Get All Icons

```typescript
import {
  getAllInteractionIcons,
  getAllPaymentStatusIcons,
  getAllPurchaseIcons
} from '@/lib/payments-config'

const interactionIcons = getAllInteractionIcons()
// { zap: ZapIcon, heart: HeartIcon, comment: MessageCircleIcon }
```

### TypeScript Types

```typescript
import type { PaymentsConfig, ProgressBasis } from '@/lib/payments-config'

const basis: ProgressBasis = 'server' // or 'serverPlusViewer'
```

## Configuration Recipes

### Higher Minimum Zaps

```json
{
  "zap": {
    "quickAmounts": [100, 500, 1000, 5000, 10000],
    "defaultQuickIndex": 2,
    "minCustomZap": 100
  },
  "purchase": {
    "minZap": 1000
  }
}
```

### Disable Auto QR

```json
{
  "zap": {
    "autoShowQr": false
  },
  "purchase": {
    "autoShowQr": false
  }
}
```

### Show More Recent Zaps

```json
{
  "zap": {
    "recentZapsLimit": 15
  }
}
```

### Always Show Privacy Toggle

```json
{
  "zap": {
    "privacyToggle": {
      "enabled": true,
      "requireAuth": false,
      "hideWhenPrivkeyPresent": false
    }
  }
}
```

### Include Viewer Zaps in Progress

```json
{
  "purchase": {
    "progressBasis": "serverPlusViewer"
  }
}
```

This shows the user's pending zaps in the progress bar, even before they're confirmed on the server.

### Bitcoin-Friendly Presets

```json
{
  "zap": {
    "quickAmounts": [21, 210, 2100, 21000, 210000],
    "defaultQuickIndex": 1
  }
}
```

## Related Documentation

- [config-system.md](../config-system.md) - Config system overview
- [purchases-and-zaps.md](../purchases-and-zaps.md) - Purchase system architecture
- [zap-flow.md](../zap-flow.md) - Zap dialog behavior
