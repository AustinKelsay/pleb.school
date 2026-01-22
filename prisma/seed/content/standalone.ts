/**
 * Standalone Resources
 *
 * Individual resources not part of any course.
 * These provide quick references and supplemental learning materials.
 * Target audience: Admins vetting pleb.school for potential self-hosting.
 */

import { PLACEHOLDER_IMAGES, PLACEHOLDER_VIDEOS } from '../config'

export interface StandaloneResource {
  id: string
  title: string
  summary: string
  content: string
  type: 'document' | 'video'
  topics: string[]
  image?: string
  videoUrl?: string
  price: number
  authorPersonaId: string
}

export const STANDALONE_RESOURCES: StandaloneResource[] = [
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000001', // Quick Start Guide
    title: 'Quick Start Guide (Evaluator Edition)',
    summary:
      'The fastest path to understanding both the learner flow and the admin flow in pleb.school.',
    type: 'document',
    topics: ['beginner', 'quickstart', 'guide', 'admin', 'self-hosting'],
    image: PLACEHOLDER_IMAGES.quickStart,
    price: 0,
    authorPersonaId: 'satoshi-sensei',
    content: `# pleb.school Quick Start (Evaluator Edition)

This guide is for people deciding whether to fork and self-host pleb.school. It shows the shortest path through both the learner flow and the admin flow.

## 1) Experience the learner flow (3 minutes)
- Visit / and browse the featured sections
- Open /courses and /content
- Open a paid item to see the zap purchase dialog
- Visit Profile > Activity to see purchase history
- Visit Profile > Accounts to see linking options

## 2) Experience the admin flow (5 minutes)
- Add your pubkey to config/admin.json or set Role.admin in the database
- Open /create to draft a resource or course
- Preview and publish, then confirm a noteId is stored
- Visit Profile > Content to inspect, edit, or republish content

## 3) Configure your instance
- auth.json: sign-in providers and copy
- content.json: homepage sections and filters
- payments.json: zap presets and purchase UX
- nostr.json: relay sets for publishing and reading
- theme.json and copy.json: branding and text

## 4) Required environment variables
- DATABASE_URL
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- PRIVKEY_ENCRYPTION_KEY

Config files are shipped to the client, so keep secrets in env vars.

---

If you can complete the steps above, you understand the core operating model of pleb.school.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000002', // Bitcoin Basics Video
    title: 'Bitcoin Basics for Admins and Builders',
    summary:
      'Why Bitcoin and Lightning are foundational to pleb.school, and what that means for payments.',
    type: 'video',
    topics: ['bitcoin', 'lightning', 'beginner', 'payments'],
    videoUrl: PLACEHOLDER_VIDEOS.bitcoinBasics,
    image: PLACEHOLDER_IMAGES.bitcoinBasics,
    price: 0,
    authorPersonaId: 'builder-bob',
    content: `## Why Bitcoin and Lightning matter for pleb.school

This video explains why the platform is built on Lightning and Nostr:

- Lightning enables instant, global micro-payments
- Zaps (NIP-57) give every payment a verifiable Nostr receipt
- Creators receive funds directly; the platform does not custody payments
- Payments work globally without traditional processors

For admins, this means fewer compliance burdens and more flexibility. For learners, it means fast and simple support for creators.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000003', // Creating Content Guide
    title: 'Creating Content on pleb.school',
    summary:
      'Admin and creator guide to drafts, publishing, and how Nostr events are generated.',
    type: 'document',
    topics: ['content-creation', 'publishing', 'creator', 'admin'],
    image: PLACEHOLDER_IMAGES.contentCreation,
    price: 5000,
    authorPersonaId: 'lightning-lucy',
    content: `# Creating content on pleb.school (admin/creator guide)

## Who can publish
Content creation is permissioned. Admins and moderators are defined in config/admin.json or via the Role.admin flag in the database.

## Drafts first
- Drafts are stored in the database and remain private until published
- Use /create to start a resource or course draft
- Preview and edit as needed

## Publish a resource
- Provide title, summary, topics, and markdown content
- Optional image and video URL
- Set a price in sats (0 = free); the database price is authoritative
- Publish: sign with NIP-07 (Nostr-first) or server-side (OAuth-first)
- The Nostr event is broadcast to relays and linked by noteId

## Publish a course
- Courses are ordered lists of lesson resources
- The publish flow creates lesson events first, then the course list (NIP-51)
- Lesson ordering is stored in the database for reliable display

## After publishing
- Manage content in Profile > Content
- Edit metadata or republish to Nostr
- Deletion is blocked if items are tied to purchases or lessons

---

The workflow is designed to feel like a traditional CMS while producing portable Nostr-native content.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000004', // Architecture Deep Dive
    title: 'Platform Architecture Deep Dive',
    summary:
      'A technical overview of the hybrid database + Nostr model and the core data flows.',
    type: 'document',
    topics: ['architecture', 'technical', 'nostr', 'development'],
    image: PLACEHOLDER_IMAGES.architecture,
    price: 15000,
    authorPersonaId: 'builder-bob',
    content: `# pleb.school Technical Architecture (Evaluator Notes)

## Stack overview
- Next.js App Router
- PostgreSQL + Prisma
- Nostr events via snstr
- NextAuth for authentication
- Lightning payments via NIP-57 zaps

## Hybrid model
- Database: users, prices, purchases, drafts, lesson ordering
- Nostr: course and lesson content, profiles, zap receipts

## Adapter pattern
CourseAdapter and ResourceAdapter merge database metadata with parsed Nostr events into display types used across the UI.

## Read flow
1. Fetch DB record by id
2. Fetch Nostr note by noteId
3. Parse event (NIP-23/99/51)
4. Merge into a display object for UI and access checks

## Write flow
1. Draft stored in DB
2. Build Nostr event
3. Sign with NIP-07 or server key
4. Publish to relays
5. Store noteId in DB

## Access control
- Paid items require purchases recorded in the database
- Purchases are claimed by verifying zap receipts
- Course purchases can unlock lesson resources

## Analytics
- View counts stored in KV with DB fallback
- Admin analytics use aggregated view data

This architecture gives you reliability without losing portability.
`,
  },
  // ============================================================
  // ADMIN-FOCUSED EDUCATIONAL DOCUMENTS
  // Target audience: Admins vetting pleb.school for self-hosting
  // ============================================================
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000005', // Platform Overview
    title: 'pleb.school Platform Overview',
    summary:
      'What pleb.school is, why it exists, and what you gain by self-hosting.',
    type: 'document',
    topics: ['overview', 'admin', 'platform', 'architecture'],
    image: PLACEHOLDER_IMAGES.platformOverview,
    price: 0,
    authorPersonaId: 'satoshi-sensei',
    content: `# pleb.school Platform Overview

pleb.school is an open-source, self-hostable learning platform built for Bitcoin and Nostr communities. It blends a traditional LMS with decentralized content and peer-to-peer payments.

## Why self-host?
- Own your user database, pricing, and moderation rules
- Customize branding and UX without touching code
- Choose the relays you publish to and read from
- Avoid vendor lock-in while keeping content portable

## What makes it different
| Traditional LMS | pleb.school |
| --- | --- |
| Centralized content | Content published to Nostr |
| Platform fees | Direct Lightning payments |
| Locked-in data | Portable, signed events |
| Single login option | Nostr, email, GitHub, anonymous |

## Key features for admins
- Drafts and publishing to Nostr
- Zap-based purchases with receipt verification
- Admin-only content management and analytics
- Config-driven theming, copy, and navigation

## Shared vs local
- Local: your users, pricing, drafts, purchases, admin rules
- Shared: Nostr content and profiles (discoverable across instances)

If you want a platform that feels like a modern LMS but runs on open protocols, this is it.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000006', // Hybrid Architecture
    title: 'The Hybrid Data Architecture',
    summary:
      'How pleb.school combines PostgreSQL and Nostr for reliable operations and portable content.',
    type: 'document',
    topics: ['architecture', 'nostr', 'database', 'admin'],
    image: PLACEHOLDER_IMAGES.hybridArchitecture,
    price: 0,
    authorPersonaId: 'builder-bob',
    content: `# The Hybrid Data Architecture

pleb.school keeps operational state in PostgreSQL while publishing content to Nostr. This gives you reliability and portability at the same time.

## What lives where

### PostgreSQL
- Users and sessions
- Pricing and purchases
- Drafts and lesson ordering
- Admin roles and permissions

### Nostr
- Courses (NIP-51)
- Resources (NIP-23 / NIP-99)
- Profiles (kind 0)
- Zap receipts (NIP-57)

## Why hybrid
- Databases are fast and consistent for access checks
- Nostr makes content portable and verifiable
- Each published item is linked by noteId for fast hydration

## Core flows

### Publishing
Draft -> build event -> sign -> publish to relays -> store noteId

### Display
DB metadata + Nostr content -> unified display object

### Purchase
Zap receipts -> claim purchase -> access granted by DB entitlement

The hybrid approach is the core reason pleb.school can be both reliable and censorship-resistant.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000007', // Auth System
    title: 'Authentication & Identity System',
    summary:
      'How pleb.school handles multi-provider login, Nostr-first identity, and account linking.',
    type: 'document',
    topics: ['authentication', 'identity', 'admin', 'security'],
    image: PLACEHOLDER_IMAGES.authSystem,
    price: 0,
    authorPersonaId: 'builder-bob',
    content: `# Authentication & Identity System

pleb.school supports Nostr-first and OAuth-first accounts with a unified identity model.

## Nostr-first providers
- NIP-07 browser extension login
- Anonymous login (server-generated keys)
- Recovery login

Nostr-first accounts use the Nostr profile as the source of truth and authenticate via NIP-98 signed events.

## OAuth-first providers
- Email magic links
- GitHub OAuth

OAuth-first accounts use platform profile data and receive a server-managed Nostr keypair for protocol access. Keys are encrypted at rest.

## Account linking
Users can link Nostr, GitHub, and email into one account. Linking Nostr upgrades the profile source to Nostr-first and syncs profile data from relays.

## Anonymous security model
- Anonymous accounts use reconnect tokens (no private keys stored in the browser)
- Tokens rotate on every login
- Dual rate limits protect against abuse

## Admin controls
Auth providers are configured in config/auth.json. GitHub requires client id and secret environment variables.

This system lets you reduce onboarding friction while preserving self-custody for Nostr-native users.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000008', // Payment System
    title: 'Payment System & Zaps',
    summary:
      'How zaps power tips and purchases without a payment processor.',
    type: 'document',
    topics: ['payments', 'zaps', 'lightning', 'admin'],
    image: PLACEHOLDER_IMAGES.paymentSystem,
    price: 0,
    authorPersonaId: 'lightning-lucy',
    content: `# Payment System & Zaps

pleb.school uses NIP-57 zaps for payments. Funds go directly to creators; the platform only verifies receipts.

## Two payment modes

### Tips
- Can be sent without a session if a signer is available
- Great for supporting free content

### Purchases
- Require an authenticated session
- Unlocks content once verified receipts meet the price
- Supports partial payments and installment zaps

## Claim behavior
- Auto-claim when receipts meet the price
- Manual "Unlock with past zaps" retry when needed
- Receipts are stored in the database for audit

## Admin notes
- Database price is authoritative; Nostr price is a hint
- Receipts are verified for signature, invoice hash, amount, recipient, and event match
- If receipts only appear on non-configured relays, claims can fail until relays are updated

Payments stay peer-to-peer while entitlements remain reliable.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000009', // Configuration Guide
    title: 'Configuration & Customization',
    summary:
      'How to brand and configure your pleb.school instance using JSON config files.',
    type: 'document',
    topics: ['configuration', 'customization', 'admin', 'theming'],
    image: PLACEHOLDER_IMAGES.configuration,
    price: 0,
    authorPersonaId: 'satoshi-sensei',
    content: `# Configuration & Customization

pleb.school uses JSON configuration files in the config directory. These files are shipped to the client, so never put secrets there.

## Config files overview
| File | Purpose |
| --- | --- |
| auth.json | Auth providers, sign-in UI, copy |
| content.json | Homepage sections, filters, search |
| copy.json | User-facing text and navigation |
| theme.json | Theme and font UI defaults |
| payments.json | Zap presets and purchase UX |
| nostr.json | Relay sets and publishing defaults |
| admin.json | Admin and moderator pubkeys |

## Required environment variables
- DATABASE_URL
- NEXTAUTH_SECRET
- NEXTAUTH_URL
- PRIVKEY_ENCRYPTION_KEY

## Tips for operators
- Keep secrets in env vars, not config files
- Use content.json to reshape the homepage without code
- Use copy.json to localize or rebrand text quickly
- Use nostr.json to control publishing and read relays

Config-first customization keeps the platform approachable for non-technical operators.
`,
  },
  {
    id: 'c3d4e5f6-0003-4000-8000-000000000010', // Publishing Flow
    title: 'Content Publishing Flow',
    summary:
      'How drafts become signed Nostr events and how courses are assembled.',
    type: 'document',
    topics: ['publishing', 'content', 'nostr', 'admin'],
    image: PLACEHOLDER_IMAGES.publishingFlow,
    price: 0,
    authorPersonaId: 'lightning-lucy',
    content: `# Content Publishing Flow

Drafts live in the database until published. Publishing creates Nostr events, signs them, and broadcasts to relays.

## Resource publishing
- Draft stored in DB
- Build event (NIP-23 for free, NIP-99 for paid)
- Sign with NIP-07 (Nostr-first) or server-side key (OAuth-first)
- Publish to relays
- Store noteId in DB

## Course publishing
- Publish each lesson resource first
- Build course list event (NIP-51) that references lesson identifiers
- Publish course event
- Store noteId and lesson ordering in DB

## Relay strategy
- Publish to a stable set of relays for redundancy
- Read from a broader relay set for discovery

This flow keeps drafts private until you are ready, while ensuring published content is portable and verifiable.
`,
  },
]
