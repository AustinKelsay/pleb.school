/**
 * Welcome Course Content
 *
 * "Welcome to pleb.school" - A free introductory course that teaches
 * users how the platform works and what running it looks like for admins.
 */

import { PLACEHOLDER_IMAGES, PLACEHOLDER_VIDEOS } from '../config'

export interface LessonDefinition {
  id: string
  title: string
  summary: string
  content: string
  type: 'document' | 'video'
  topics: string[]
  image?: string
  videoUrl?: string
  price: number
}

export interface CourseDefinition {
  id: string
  title: string
  description: string
  image: string
  price: number
  topics: string[]
  authorPersonaId: string
  lessons: LessonDefinition[]
}

export const WELCOME_COURSE: CourseDefinition = {
  id: 'welcome-to-pleb-school',
  title: 'Welcome to pleb.school',
  description:
    'A practical, admin-friendly orientation to pleb.school. Learn the learner experience and what operating the platform looks like.',
  image: PLACEHOLDER_IMAGES.welcomeCourse,
  price: 0,
  topics: ['beginner', 'platform', 'nostr', 'admin', 'self-hosting'],
  authorPersonaId: 'satoshi-sensei',
  lessons: [
    {
      id: 'a1b2c3d4-0001-4000-8000-000000000001', // Welcome Lesson 1: Overview
      title: 'Platform Overview: Learner and Admin Lens',
      summary:
        'What pleb.school is, how the hybrid architecture works, and what you should evaluate in this demo.',
      type: 'document',
      topics: ['introduction', 'overview', 'admin', 'beginner'],
      image: PLACEHOLDER_IMAGES.welcomeCourse,
      price: 0,
      content: `# Welcome to pleb.school

## What you are looking at
This demo is the default first-run experience for a self-hosted pleb.school instance. It is designed to help you evaluate both the learner experience and the operator experience.

## The core idea
pleb.school is an open-source learning platform that combines:
- PostgreSQL for user state, pricing, and access control
- Nostr for content distribution and signed authorship
- Lightning (NIP-57 zaps) for peer-to-peer payments

## Two experiences, one codebase

### Learners get
- A clean home page with featured sections
- Courses and standalone resources with fast navigation
- Native Bitcoin payments with transparent progress toward unlock
- Profiles with account linking and activity history

### Admins/operators get
- Full control of your user database and pricing
- Config-driven branding, copy, and navigation
- Relay selection for publishing and reading content
- Admin-only tools for content management and analytics

## The hybrid model in one table

| Layer | Stores | Why it matters |
| --- | --- | --- |
| Database | Users, pricing, purchases, drafts | Reliable access control and fast queries |
| Nostr | Lesson and course content, profiles, zap receipts | Portability, signatures, censorship resistance |
| Lightning | Payments | Instant global settlement with no processor |

## What to verify in this demo
1. Browse courses and resources to see Nostr-backed content.
2. Open a paid item to preview the zap purchase flow.
3. Visit Profile to inspect account linking and purchase activity.
4. If you are an admin, open Profile > Content and Profile > Analytics.

Next: authentication and identity, so you can understand how users log in and how profiles are managed.
`,
    },
    {
      id: 'a1b2c3d4-0001-4000-8000-000000000002', // Welcome Lesson 2: Auth
      title: 'Authentication & Identity Basics',
      summary:
        'How users sign in, how identity is managed, and what admins can configure.',
      type: 'video',
      topics: ['authentication', 'security', 'nostr', 'admin'],
      videoUrl: PLACEHOLDER_VIDEOS.nostrIntro,
      price: 0,
      content: `## Authentication & identity: the short version

pleb.school supports multiple sign-in paths so you can serve both Nostr-native users and newcomers. Every account can still interact with Nostr.

### Nostr-first login (NIP-07)
- Users sign in with a NIP-07 browser extension
- Authentication uses NIP-98 signed events (kind 27235)
- The platform never sees the private key
- Nostr profile data is the source of truth

### OAuth-first login (email or GitHub)
- Email uses magic links; GitHub uses OAuth
- The platform creates a Nostr keypair for protocol access
- Private keys are encrypted at rest with PRIVKEY_ENCRYPTION_KEY
- The platform profile is authoritative unless a Nostr account is linked

### Anonymous access
- Users can try the app with a server-generated keypair
- A reconnect token keeps the session across browser restarts
- Rate limits protect against abuse

### Account linking and profile priority
- Users can link Nostr, GitHub, and email into one account
- Linking Nostr upgrades the account to Nostr-first
- Profile fields show source badges so users understand what is authoritative

### Admin controls
Authentication providers are configured in config/auth.json:
- Enable or disable Nostr, email, GitHub, anonymous
- Customize sign-in copy and icons
- GitHub requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

This flexible identity model reduces onboarding friction without sacrificing self-custody.
`,
    },
    {
      id: 'a1b2c3d4-0001-4000-8000-000000000003', // Welcome Lesson 3: Nostr
      title: 'How Content Lives on Nostr',
      summary:
        'The exact Nostr event types used for courses and resources, and how the database fits in.',
      type: 'document',
      topics: ['nostr', 'nip-23', 'nip-51', 'technical'],
      image: PLACEHOLDER_IMAGES.architecture,
      price: 0,
      content: `# How pleb.school uses Nostr for content

pleb.school publishes course and lesson content to Nostr and keeps operational metadata in PostgreSQL. The UI merges both sources into a single, consistent view.

## Event kinds used

- NIP-23 (kind 30023): free resources (long-form)
- NIP-99 (kind 30402): paid resources (classified listings with price hint)
- NIP-51 (kind 30004): courses (lists of lessons)
- NIP-57 (kind 9735): zap receipts
- NIP-01 (kind 0): profiles

### Example: free resource (NIP-23)
\`\`\`json
{ "kind": 30023, "tags": [["d","lesson-id"],["title","Lesson title"],["summary","..."]] }
\`\`\`

### Example: paid resource (NIP-99)
\`\`\`json
{ "kind": 30402, "tags": [["d","lesson-id"],["title","Premium lesson"],["price","10000","sats"]] }
\`\`\`

### Example: course (NIP-51)
\`\`\`json
{ "kind": 30004, "tags": [["d","course-id"],["name","Course title"],["a","30023:pubkey:lesson-id"]] }
\`\`\`

## Why the database still matters
- The database stores the authoritative price and ownership
- Each published event is linked via a noteId
- The UI merges DB metadata with Nostr content for display and access checks

## Publishing flow (high level)
Draft in DB -> create event -> sign (NIP-07 or server-side) -> publish to relays -> store noteId

Publishing to Nostr makes content portable and verifiable, while pleb.school enforces access to paid content based on database purchases and zap receipts.
`,
    },
    {
      id: 'a1b2c3d4-0001-4000-8000-000000000004', // Welcome Lesson 4: Navigation
      title: 'Finding Content and Configuring Discovery',
      summary:
        'A tour of the learner-facing routes plus the config files that let admins shape discovery.',
      type: 'video',
      topics: ['navigation', 'ui', 'admin'],
      videoUrl: PLACEHOLDER_VIDEOS.bitcoinBasics,
      price: 0,
      content: `## Finding content and configuring discovery

### Learner-facing routes
- / (Home): featured sections and onboarding copy
- /courses: course catalog
- /content: resource catalog
- /search: full-text search with Nostr query support
- /courses/[id] and /content/[id]: content detail
- /courses/[id]/lessons/[lessonId]: lesson view

### Creator and admin routes
- /create: draft creation (admin only)
- /drafts: manage drafts, preview, publish

### Filters and discovery
- Filter by type, category, and price
- Topic tags come directly from Nostr event tags
- Search behavior and homepage sections are configured in config/content.json

### What admins can customize without code
- config/content.json: homepage sections, filters, categories
- config/copy.json: navigation and page copy
- config/theme.json: theme and font UI
- config/payments.json: zap presets and purchase UX
- config/nostr.json: relay sets and publishing defaults

In other words: you can rebrand and restructure the entire discovery experience from JSON, not code.
`,
    },
    {
      id: 'a1b2c3d4-0001-4000-8000-000000000005', // Welcome Lesson 5: Completion
      title: 'Operating the Platform: Creators and Admins',
      summary:
        'How drafts, publishing, purchases, and analytics work once you run your own instance.',
      type: 'document',
      topics: ['operations', 'admin', 'publishing', 'payments'],
      image: PLACEHOLDER_IMAGES.welcomeCourse,
      price: 0,
      content: `# Operating pleb.school: creators and admins

## Drafts and publishing
- Admins create drafts at /create
- Drafts live in the database until published
- Publishing signs a Nostr event (NIP-07 for Nostr-first, server-side for OAuth-first)
- Courses publish lesson resources first, then the course list event
- Published items are linked by noteId for fast lookup

## Admin content management
Profile > Content (admin tab) lets you:
- Inspect published courses and resources
- See whether Nostr notes are in sync
- Edit metadata and republish
- Delete items only when they are not tied to purchases or lessons

## Payments and purchases
- Zaps are Lightning payments with Nostr receipts
- Purchases are claimed when receipts meet the price
- Partial payments are supported; users can unlock with past zaps
- Purchase records live in the database for access checks and audit

## Analytics and operations
- View counts are tracked via KV with a database fallback
- Admin analytics summarize platform activity
- Admins are detected via database roles or config/admin.json pubkeys

## Next steps for self-hosters
- Configure auth providers, relays, and branding
- Seed your instance with your own content
- Decide your moderation and pricing strategy

This is the operational heart of pleb.school: simple for learners, powerful for operators.
`,
    },
  ],
}
