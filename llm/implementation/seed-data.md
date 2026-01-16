# Seed Data System

Complete demo seed data infrastructure for pleb.school. Creates reproducible demo instances with real Nostr events, deterministic key pairs, and sample user progress.

## Overview

The seed system populates a pleb.school instance with:
- 5 demo user personas with full Nostr profiles
- 2 educational courses (9 lessons total)
- 10 standalone resources
- Demo progress, purchases, and enrollments

**Key Features:**
- **Deterministic keys**: Same seed always produces same key pairs
- **Real Nostr publishing**: Events published to public relays
- **Idempotent**: Safe to re-run (uses upsert patterns)
- **Dry-run mode**: Test without publishing to relays

## Usage

```bash
# Full run - publishes to Nostr relays
npm run db:seed

# Dry run - skips Nostr publishing
SEED_DRY_RUN=true npm run db:seed

# Via Docker
docker exec plebschool-app npm run db:seed
docker exec plebschool-app sh -c "SEED_DRY_RUN=true npm run db:seed"
```

---

## File Structure

```
prisma/
├── seed.ts                           # Main entry point
└── seed/
    ├── config.ts                     # Configuration constants
    ├── personas.ts                   # User personas and key pair generation
    ├── demo-state.ts                 # Demo progress, purchases, enrollments
    ├── nostr-publisher.ts            # Event creation and relay publishing
    └── content/
        ├── index.ts                  # Content aggregation and exports
        ├── welcome-course.ts         # Welcome to pleb.school course (5 lessons)
        ├── zaps-course.ts            # Mastering Zaps course (4 lessons)
        └── standalone.ts             # Standalone resources (10 items)
```

| File | Purpose |
|------|---------|
| `seed.ts` | Main orchestration: users → roles → profiles → content → demo state |
| `config.ts` | Seed version, relay list, placeholder images/videos, avatar/banner generators |
| `personas.ts` | 5 demo personas with deterministic key pair generation |
| `nostr-publisher.ts` | Event creation (kind 0, 30023, 30402, 30004) and relay publishing |
| `demo-state.ts` | Creates sample progress, purchases, enrollments for demo users |
| `content/` | Course and resource definitions with full markdown content |

---

## Configuration (`config.ts`)

### Constants

```typescript
export const SEED_VERSION = 'v1'
export const SEED_PREFIX = 'pleb.school-demo-seed-v1'

export const PUBLISH_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nostr.land',
]

export const RELAY_TIMEOUT = 10000  // 10 seconds
```

### Placeholder Content

```typescript
export const PLACEHOLDER_VIDEOS = {
  bitcoinBasics: 'https://www.youtube.com/watch?v=bBC-nXj3Ng4',
  lightningNetwork: 'https://www.youtube.com/watch?v=rrr_zPmEiME',
  nostrIntro: 'https://www.youtube.com/watch?v=5W-jtbbh4gA',
  walletSetup: 'https://www.youtube.com/watch?v=CwV6qJRAWlU',
}

export const PLACEHOLDER_IMAGES = {
  welcomeCourse: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3...',
  zapsCourse: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040...',
  // ... more images
}
```

### Avatar and Banner Generation

```typescript
// Deterministic RoboHash avatars
export function generateAvatar(personaId: string): string {
  return `https://robohash.org/${personaId}?set=set4&size=200x200`
}

// Persona-specific Unsplash banners
export function generateBanner(personaId: string): string {
  const bannerMap: Record<string, string> = {
    'satoshi-sensei': 'https://images.unsplash.com/...',  // Bitcoin theme
    'lightning-lucy': 'https://images.unsplash.com/...',  // Lightning theme
    // ... more banners
  }
  return bannerMap[personaId] || bannerMap['nostr-newbie']
}
```

---

## Personas System (`personas.ts`)

### Interfaces

```typescript
export interface SeedPersona {
  id: string
  username: string | null
  displayName: string
  about: string | null
  email: string | null
  nip05: string | null
  lud16: string | null
  avatar: string | null
  banner: string | null
  role: 'admin' | 'creator' | 'learner' | null
  profileSource: 'nostr' | 'oauth'
  primaryProvider: string
}

export interface SeedPersonaWithKeys extends SeedPersona {
  privkey: string
  pubkey: string
}
```

### Deterministic Key Generation

> **⚠️ SECURITY WARNING: Demo/Seed Data Only**
>
> The `generateDeterministicKeypair` function below uses a predictable seed (`SEED_PREFIX` + `personaId`) to derive private keys. **This is intentionally insecure** for reproducible demo data.
>
> **DO NOT use this pattern for production user accounts.** Anyone who knows the seed pattern can trivially regenerate any private key (e.g., `sha256("pleb.school-demo-seed-v1:satoshi-sensei")`).
>
> For real user accounts, use:
> - Cryptographically secure random key generation (`crypto.randomBytes` or `window.crypto.getRandomValues`)
> - Hardware security modules (HSM) or key management services (KMS) for sensitive deployments

```typescript
export function generateDeterministicKeypair(personaId: string): {
  privkey: string
  pubkey: string
} {
  const seed = `${SEED_PREFIX}:${personaId}`  // e.g., "pleb.school-demo-seed-v1:satoshi-sensei"
  const privkey = createHash('sha256').update(seed).digest('hex')
  const pubkey = getPublicKey(privkey)
  return { privkey, pubkey }
}
```

### Demo Personas (5 total)

| ID | Display Name | Role | Profile Source | Purpose |
|----|--------------|------|----------------|---------|
| `satoshi-sensei` | Satoshi Sensei | admin | nostr | Primary course author, platform admin |
| `lightning-lucy` | Lightning Lucy | creator | nostr | Payments/zaps educator |
| `builder-bob` | Builder Bob | creator | nostr | Technical content creator |
| `nostr-newbie` | Alex (New User) | learner | oauth (email) | Demo learner with progress |
| `anon-learner` | Anonymous Pleb | null | oauth (anonymous) | Minimal profile demo user |

**NPubs:**
- Satoshi Sensei: `npub18t35j39m2dwru8f7r60wjmcyxz7td8wx4h5fwsufac2k55r7ul4q2ac6jq`
- Lightning Lucy: `npub1ruau9elazkenqa2x0s2rjxu5f6ndshfput7gaa9azkkh0ff8n0cqtdw2d9`
- Builder Bob: `npub1v8cjwkpx9eqrgk336f3twjycramzr7xwc0jj7lsq8f8zgj82450q8cdk4l`
- Nostr Newbie: `npub15rmx27wdmal9eu6wdyc4nl3uj7pnu4vmdzxsaz5aqa9l8ucvxkssqnpcat`
- Anon Learner: `npub172agdrgczazalgs59yzqr4hxv4ar8pu04ssn5yrk7643prneztaqv0vguw`

**NIP-05 and Lightning Addresses:**
- `satoshisensei@vlt.ge`, `lightninglucy@vlt.ge`, `builderbob@vlt.ge`, `nostrnewbie@vlt.ge`
- Anonymous user has null for all profile fields

### Helper Functions

```typescript
getPersonasWithKeys(): SeedPersonaWithKeys[]     // All personas with keys
getPersonaWithKeys(id: string): SeedPersonaWithKeys | undefined
getPersonasByRole(role): SeedPersona[]           // Filter by role
getAdminPersonas(): SeedPersona[]                // role === 'admin'
getCreatorPersonas(): SeedPersona[]              // role === 'admin' || 'creator'
```

---

## Nostr Publisher (`nostr-publisher.ts`)

### Event Kinds

```typescript
export const EVENT_KINDS = {
  PROFILE: 0,              // NIP-01 user profiles
  LONG_FORM_CONTENT: 30023, // NIP-23 free resources
  CLASSIFIED_LISTING: 30402, // NIP-99 paid resources
  CURATION_SET: 30004,      // NIP-51 courses
}
```

### Dry Run Detection

```typescript
export function isDryRun(): boolean {
  return process.env.SEED_DRY_RUN === 'true' || process.env.SEED_DRY_RUN === '1'
}
```

### Event Creation Functions

#### Profile Events (Kind 0)

```typescript
export interface ProfileEventParams {
  privkey: string
  name: string
  about: string
  picture?: string | null
  banner?: string | null
  nip05?: string | null
  lud16?: string | null
}

export async function createProfileEvent(params: ProfileEventParams): Promise<NostrEvent>
// Returns signed kind 0 event with JSON content
```

#### Resource Events (Kind 30023 / 30402)

```typescript
export interface ResourceEventParams {
  privkey: string
  dTag: string
  title: string
  summary: string
  content: string
  image?: string | null
  price: number           // 0 = free (30023), >0 = paid (30402)
  topics: string[]
  type: 'document' | 'video'
  videoUrl?: string | null
}

export async function createResourceEvent(params: ResourceEventParams): Promise<NostrEvent>
// Returns signed addressable event
// Video content gets YouTube embed HTML prepended
```

#### Course Events (Kind 30004)

```typescript
export interface CourseEventParams {
  privkey: string
  dTag: string
  title: string
  description: string
  image?: string | null
  price: number
  topics: string[]
  lessonReferences: Array<{
    kind: number      // 30023 or 30402
    pubkey: string
    dTag: string
  }>
}

export async function createCourseEvent(params: CourseEventParams): Promise<NostrEvent>
// Returns signed kind 30004 with 'a' tags referencing lessons
```

### Publishing Functions

```typescript
export interface PublishResult {
  event: NostrEvent
  publishedRelays: string[]
  failedRelays: string[]
}

// Single event
export async function publishEvent(
  event: NostrEvent,
  relays?: string[],
  options?: { forceDryRun?: boolean }
): Promise<PublishResult>

// Batch (sequential with 100ms delay)
export async function publishEvents(
  events: NostrEvent[],
  relays?: string[],
  options?: { forceDryRun?: boolean }
): Promise<PublishResult[]>
```

---

## Content Definitions (`content/`)

### Interfaces

**Important:** Lesson and standalone resource IDs MUST be valid UUIDs because they become Resource IDs in the database, and the `/api/resources/[id]` endpoint validates for UUID format.

```typescript
export interface LessonDefinition {
  id: string               // MUST be a valid UUID (e.g., 'a1b2c3d4-0001-4000-8000-000000000001')
  title: string
  summary: string
  content: string          // Full markdown
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
  authorPersonaId: string  // Links to persona
  lessons: LessonDefinition[]
}

export interface StandaloneResource {
  id: string               // MUST be a valid UUID (e.g., 'c3d4e5f6-0003-4000-8000-000000000001')
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
```

### Courses

#### Welcome to pleb.school (FREE)
- **ID:** `welcome-to-pleb-school`
- **Author:** Satoshi Sensei
- **Price:** 0 sats
- **Lessons (5):**
  1. Platform Overview: Learner and Admin Lens
  2. Authentication & Identity Basics (video)
  3. How Content Lives on Nostr
  4. Finding Content and Configuring Discovery (video)
  5. Operating the Platform: Creators and Admins

#### Mastering Zaps & Purchases (PAID)
- **ID:** `mastering-zaps-purchases`
- **Author:** Lightning Lucy
- **Price:** 100 sats (for testing)
- **Lessons (4, each 21 sats individually):**
  1. Zaps 101: Lightning Payments with Nostr Receipts (21 sats)
  2. Setting Up Your Lightning Identity (video, 21 sats)
  3. Making Your First Zap (video, 21 sats)
  4. Purchase Claims & Verification (21 sats)

### Standalone Resources (10 total)

All resource IDs are UUIDs for consistency with API validation.

| ID | Title | Author | Price | Focus |
|----|-------|--------|-------|-------|
| `c3d4e5f6-0003-4000-8000-000000000001` | Quick Start Guide (Evaluator Edition) | Satoshi Sensei | 0 | Admin demo walkthrough |
| `c3d4e5f6-0003-4000-8000-000000000002` | Bitcoin Basics for Admins and Builders | Builder Bob | 0 | Bitcoin overview (video) |
| `c3d4e5f6-0003-4000-8000-000000000003` | Creating Content on pleb.school | Lightning Lucy | 5,000 | Content creation guide |
| `c3d4e5f6-0003-4000-8000-000000000004` | Platform Architecture Deep Dive | Builder Bob | 15,000 | Technical deep dive |
| `c3d4e5f6-0003-4000-8000-000000000005` | pleb.school Platform Overview | Satoshi Sensei | 0 | What pleb.school is |
| `c3d4e5f6-0003-4000-8000-000000000006` | The Hybrid Data Architecture | Builder Bob | 0 | DB + Nostr explained |
| `c3d4e5f6-0003-4000-8000-000000000007` | Authentication & Identity System | Builder Bob | 0 | Multi-auth system |
| `c3d4e5f6-0003-4000-8000-000000000008` | Payment System & Zaps | Lightning Lucy | 0 | NIP-57 payments |
| `c3d4e5f6-0003-4000-8000-000000000009` | Configuration & Customization | Satoshi Sensei | 0 | JSON config system |
| `c3d4e5f6-0003-4000-8000-000000000010` | Content Publishing Flow | Lightning Lucy | 0 | Draft to Nostr pipeline |

### Exports

```typescript
// content/index.ts
export const ALL_COURSES: CourseDefinition[] = [WELCOME_COURSE, ZAPS_COURSE]
export const ALL_STANDALONE: StandaloneResource[] = STANDALONE_RESOURCES
```

---

## Demo State Generator (`demo-state.ts`)

### Configuration Interface

```typescript
export interface DemoStateConfig {
  userIdMap: Map<string, string>      // Persona ID → DB user ID
  courseIds: string[]
  resourceIds: string[]
  lessonIdsByCourse: Map<string, string[]>
}
```

### What Gets Created

#### Course Progress (nostr-newbie)
- **UserCourse:** Started welcome course 7 days ago, not completed
- **UserLesson:** Lessons 1-2 completed, lesson 3 opened but not completed
- Staggered timestamps for realistic demo

#### Simulated Purchase (nostr-newbie)
- **Purchase:** Zaps course with `paymentType: 'manual'` (indicates seed data)
- **UserCourse:** Enrolled but not started

#### Basic Enrollment (anon-learner)
- **UserCourse:** Enrolled in welcome course, not started

---

## Main Entry Point (`seed.ts`)

### Execution Flow

```
1. Initialize
   └─ Load config, connect to Prisma

2. Create Users (STEP 1)
   └─ Upsert 5 personas with encrypted privkeys
   └─ Track userIdMap for later steps

3. Create Admin Roles (STEP 2)
   └─ Upsert Role records for admin personas

4. Publish User Profiles (STEP 3)
   └─ Create kind 0 events for each persona
   └─ Skip personas without profile data (anon-learner)
   └─ Publish to relays (or simulate in dry-run)

5. Publish Course Content (STEP 4)
   └─ For each course:
      ├─ Publish each lesson as resource event
      ├─ Create Resource DB records with noteId
      ├─ Publish course event (kind 30004)
      ├─ Create Course DB record
      └─ Create Lesson junction records

6. Publish Standalone Resources (STEP 5)
   └─ For each standalone:
      ├─ Create resource event (30023 or 30402)
      └─ Create Resource DB record

7. Create Demo State (STEP 6)
   └─ Call createDemoState() with collected IDs

8. Summary
   └─ Print counts and dry-run status
```

### Tracking Maps

```typescript
const userIdMap = new Map<string, string>()        // persona.id → user.id
const courseIds: string[] = []                      // All course IDs
const resourceIds: string[] = []                    // All resource IDs
const lessonIdsByCourse = new Map<string, string[]>() // course.id → lesson IDs
```

---

## Database Records Created

| Table | Count | Details |
|-------|-------|---------|
| User | 5 | All personas with encrypted privkeys |
| Role | 1 | Satoshi Sensei as admin |
| Course | 2 | Welcome + Zaps courses |
| Resource | 19 | 9 lessons + 10 standalone |
| Lesson | 9 | Junction records (course → resource with index) |
| UserCourse | 3 | Demo enrollments and purchases |
| UserLesson | 3 | Demo lesson progress |
| Purchase | 1 | Simulated purchase (paymentType: 'manual') |

---

## Nostr Events Published

| Type | Kind | Count | Details |
|------|------|-------|---------|
| Profiles | 0 | 4 | All personas except anon-learner |
| Free Resources | 30023 | 13 | Welcome (5) + Standalone (8) with price=0 |
| Paid Resources | 30402 | 6 | Zaps (4) + Standalone (2) with price>0 |
| Courses | 30004 | 2 | Welcome + Zaps courses |
| **Total** | | **25** | Published to 4 relays |

---

## Extending the Seed

### Adding a New Persona

1. Add to `PERSONAS` array in `personas.ts`:
```typescript
{
  id: 'new-persona',
  username: 'new_user',
  displayName: 'New User',
  about: 'Description [pleb.school demo]',
  email: 'new@demo.pleb.school',
  nip05: 'newuser@vlt.ge',
  lud16: 'newuser@vlt.ge',
  avatar: generateAvatar('new-persona'),
  banner: generateBanner('new-persona'),
  role: 'creator',
  profileSource: 'nostr',
  primaryProvider: 'nostr',
}
```

2. If admin, add to `config/admin.json`

### Adding a New Course

1. Create `content/new-course.ts`:
```typescript
export const NEW_COURSE: CourseDefinition = {
  id: 'new-course', // Course IDs can be slugs
  title: 'New Course',
  description: '...',
  image: PLACEHOLDER_IMAGES.welcomeCourse,
  price: 0,
  topics: ['topic1', 'topic2'],
  authorPersonaId: 'satoshi-sensei',
  lessons: [
    // Lesson IDs MUST be UUIDs (used as resource IDs)
    { id: 'd4e5f6a7-0004-4000-8000-000000000001', title: '...', /* ... */ }
  ]
}
```

2. Export from `content/index.ts`:
```typescript
import { NEW_COURSE } from './new-course'
export const ALL_COURSES = [WELCOME_COURSE, ZAPS_COURSE, NEW_COURSE]
```

### Adding Standalone Resources

Add to `STANDALONE_RESOURCES` array in `standalone.ts`:
```typescript
{
  // Resource IDs MUST be UUIDs for API compatibility
  id: 'e5f6a7b8-0005-4000-8000-000000000001',
  title: 'New Resource',
  summary: '...',
  content: `# Full markdown content...`,
  type: 'document',
  topics: ['topic'],
  image: PLACEHOLDER_IMAGES.quickStart,
  price: 0,
  authorPersonaId: 'builder-bob',
}
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PRIVKEY_ENCRYPTION_KEY` | Yes | AES-256 key for privkey encryption |
| `SEED_DRY_RUN` | No | Set to `true` or `1` to skip Nostr publishing |

---

## Verification

### After Running Seed

1. **Check console output:**
   - All steps complete with ✅
   - "Database seed completed!" message
   - Correct counts in summary

2. **Verify in Nostr client:**
   - Search for seed user npubs (e.g., `npub18t35j39m2dwru8f7r60wjmcyxz7td8wx4h5fwsufac2k55r7ul4q2ac6jq`)
   - Confirm profiles display with avatar, banner, bio

3. **Verify in app:**
   - Browse /courses and /content
   - Check courses display with lessons
   - Verify paid content shows prices

4. **Re-run test:**
   - Run seed again
   - Confirm no errors (upsert handles duplicates)
   - Counts should remain the same

---

## Related Documentation

- [nostr-events.md](../context/nostr-events.md) - Event structures used by the app
- [drafts-and-publishing.md](../context/drafts-and-publishing.md) - App publishing flow
- [database-schema.md](../context/database-schema.md) - Full schema reference
- [admin-config.md](../context/config/admin-config.md) - Admin pubkey configuration
