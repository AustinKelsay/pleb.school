/**
 * Zaps Course Content
 *
 * "Mastering Zaps & Purchases" - A paid course teaching users
 * about Lightning payments and the purchase flow on pleb.school.
 */

import { PLACEHOLDER_IMAGES, PLACEHOLDER_VIDEOS } from '../config'
import type { CourseDefinition } from './welcome-course'

export const ZAPS_COURSE: CourseDefinition = {
  id: 'mastering-zaps-purchases',
  title: 'Mastering Zaps & Purchases',
  description:
    'Learn how Lightning payments work on pleb.school, how zaps unlock content, and what admins should know about the claim flow.',
  image: PLACEHOLDER_IMAGES.zapsCourse,
  price: 100, // 100 sats for testing
  topics: ['lightning', 'zaps', 'payments', 'bitcoin', 'admin'],
  authorPersonaId: 'lightning-lucy',
  lessons: [
    {
      id: 'b2c3d4e5-0002-4000-8000-000000000001', // Zaps Lesson 1: Intro
      title: 'Zaps 101: Lightning Payments with Nostr Receipts',
      summary:
        'Learn what zaps are, how the NIP-57 flow works, and how pleb.school uses zaps for tips and purchases.',
      type: 'document',
      topics: ['zaps', 'lightning', 'nip-57', 'introduction'],
      image: PLACEHOLDER_IMAGES.zapsCourse,
      price: 21,
      content: `# Zaps 101: Lightning payments with Nostr receipts

A zap is a Lightning payment that publishes a Nostr receipt (NIP-57). It is the foundation of payments on pleb.school.

## The zap flow (high level)
1. The user initiates a zap
2. A zap request event (kind 9734) is created and signed
3. The recipient's LNURL server returns an invoice
4. The user pays the invoice
5. A zap receipt (kind 9735) is published to Nostr

## Why zaps are powerful
- Instant settlement over Lightning
- Global, permissionless payments
- Public or private support
- Verifiable receipts on an open protocol

## How pleb.school uses zaps

### Appreciation zaps (tips)
Users can send a tip to any content. Tips can work without a session as long as a signer is available (NIP-07 or an anonymous keypair).

### Purchase zaps (unlocking content)
Paid content unlocks when verified zap receipts meet the price. Purchases require an authenticated session so the access record can be stored.

### Privacy mode
When privacy is enabled, the zap is signed with an anonymous key while still binding the purchase to the real account via a P tag. Users can stay private and still unlock content.

Zaps are simple for users and transparent for admins: the platform never touches funds, it only verifies receipts.
`,
    },
    {
      id: 'b2c3d4e5-0002-4000-8000-000000000002', // Zaps Lesson 2: Wallet Setup
      title: 'Setting Up Your Lightning Identity',
      summary:
        'Configure a Lightning address and understand WebLN for one-click zaps.',
      type: 'video',
      topics: ['wallet', 'lightning', 'setup', 'webln'],
      videoUrl: PLACEHOLDER_VIDEOS.walletSetup,
      price: 21,
      content: `## Lightning identity essentials

To receive zaps, creators need a Lightning address (lud16). This looks like an email address and points to your Lightning wallet.

### Where to set your Lightning address
- Nostr-first accounts: update your Nostr profile (kind 0) via a Nostr client
- OAuth-first accounts: edit the field in Profile > Settings

### WebLN for one-click zaps
If a user has a WebLN-enabled wallet extension, zaps can be paid with a single click instead of scanning a QR code.

### Admin note
Lightning addresses are stored in user profiles and used to resolve invoices. If an address is missing or invalid, the zap flow will fail early with a clear error.
`,
    },
    {
      id: 'b2c3d4e5-0002-4000-8000-000000000003', // Zaps Lesson 3: Making Zaps
      title: 'Making Your First Zap',
      summary:
        'Hands-on walkthrough of sending a zap and how the purchase progress bar works.',
      type: 'video',
      topics: ['zapping', 'purchase', 'tutorial', 'practical'],
      videoUrl: PLACEHOLDER_VIDEOS.lightningNetwork,
      price: 21,
      content: `## Zapping in practice

When you click the zap button, you will see preset amounts (quick zaps) and an optional custom amount. These presets are configurable in config/payments.json.

### What happens next
1. Choose a zap amount
2. Optionally add a message
3. Choose public or private mode
4. Pay via WebLN or QR code

### Purchase progress
For paid content, the UI shows progress toward the price. Partial payments are allowed, so learners can pay in installments. Once the verified total meets the price, access unlocks automatically.

This is the flow you are evaluating as an admin: simple for users, auditable for the platform.
`,
    },
    {
      id: 'b2c3d4e5-0002-4000-8000-000000000004', // Zaps Lesson 4: Purchase Claims
      title: 'Purchase Claims & Verification',
      summary:
        'How receipts are verified, how purchases are claimed, and what admins should expect.',
      type: 'document',
      topics: ['purchases', 'claims', 'technical', 'ownership'],
      image: PLACEHOLDER_IMAGES.zapsCourse,
      price: 21,
      content: `# Purchase claims and verification

When a user zaps paid content, pleb.school does not take custody of funds. Instead it verifies the zap receipts and records a purchase in the database.

## Auto-claim behavior
- The UI streams zap receipts from relays
- When the verified total meets the price, the purchase is auto-claimed
- If receipts are delayed, users can click "Unlock with past zaps" to retry the claim

## What is verified
- Receipt and request signatures
- Invoice hash and amount
- Recipient Lightning address match
- Correct event reference (e or a tag)

## Price snapshots and access rules
- The database price is authoritative
- When a purchase is claimed, the current price is stored as a snapshot
- Access is granted when amountPaid meets the snapshot or current price (whichever is lower)

## Admin visibility
- Purchases live in the database with full receipt JSON for audits
- Duplicate receipts are rejected
- Claims may fail if a receipt is only visible on relays outside your configured sets

This design keeps payments peer-to-peer while giving admins reliable entitlement records.
`,
    },
  ],
}
