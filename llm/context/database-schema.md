# Database Schema

PostgreSQL database schema managed by Prisma. Located in `prisma/schema.prisma`.

## Overview

The database stores metadata, user data, and relationships. Content (titles, descriptions, images) lives in Nostr events and is hydrated at runtime via the adapter pattern.

## Model Diagram

```text
User ─┬─ Account (OAuth providers)
      ├─ Session (auth sessions)
      ├─ Role (admin/subscription)
      ├─ Course ─┬─ Lesson ─── UserLesson (progress)
      │          ├─ Purchase
      │          ├─ UserCourse (progress)
      │          └─ Badge
      ├─ Resource ─┬─ Lesson
      │            └─ Purchase
      ├─ Draft (resource drafts)
      ├─ CourseDraft ─── DraftLesson
      ├─ PlatformNip05
      ├─ PlatformLightningAddress
      └─ UserBadge
```

## Core Models

### User

Primary user identity. Supports multiple auth providers.

```prisma
model User {
  id                     String    @id @default(uuid())
  pubkey                 String?   @unique  // Nostr public key (hex)
  privkey                String?             // Encrypted private key (for anon/OAuth users)
  email                  String?   @unique
  emailVerified          DateTime?
  username               String?   @unique
  displayName            String?
  avatar                 String?
  banner                 String?
  nip05                  String?             // Nostr NIP-05 identifier
  lud16                  String?             // Lightning address

  // Account linking
  primaryProvider        String?             // nostr, email, github, anonymous
  profileSource          String?   @default("oauth")  // "nostr" or "oauth"
  anonReconnectTokenHash String?   @unique  // SHA-256 hash for anonymous session persistence

  // Relations
  accounts               Account[]
  sessions               Session[]
  courses                Course[]
  resources              Resource[]
  drafts                 Draft[]
  courseDrafts           CourseDraft[]
  purchased              Purchase[]
  role                   Role?
  userLessons            UserLesson[]
  userCourses            UserCourse[]
  userBadges             UserBadge[]
  platformNip05          PlatformNip05?
  platformLightningAddress PlatformLightningAddress?

  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
}
```

### Account

OAuth provider links (NextAuth adapter).

```prisma
model Account {
  id                 String   @id @default(cuid())
  userId             String
  type               String
  provider           String   // nostr, email, github, anonymous
  providerAccountId  String   // pubkey for nostr, email for email, github id for github
  refresh_token      String?
  access_token       String?
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String?
  session_state      String?
  oauth_token_secret String?
  oauth_token        String?
  createdAt          DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

### Session

Auth sessions (NextAuth adapter).

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### VerificationToken

Email magic link tokens.

```prisma
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  lookupId   String?  @unique  // For email linking verification

  @@unique([identifier, token])
}
```

## Content Models

### Course

Course metadata. Title/description/image stored in Nostr (NIP-51 kind 30004).

```prisma
model Course {
  id                 String       @id        // Client-generated UUID
  userId             String
  price              Int          @default(0)  // Price in sats (authoritative)
  noteId             String?      @unique      // Nostr event ID
  submissionRequired Boolean      @default(false)

  // Relations
  user               User         @relation(fields: [userId], references: [id])
  lessons            Lesson[]
  purchases          Purchase[]
  userCourses        UserCourse[]
  badge              Badge?

  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  @@index([userId])
}
```

### Resource

Standalone content (videos, documents). Title/description/content stored in Nostr (NIP-23/99).

```prisma
model Resource {
  id           String        @id        // Client-generated UUID
  userId       String
  price        Int           @default(0)  // Price in sats (authoritative)
  noteId       String?       @unique      // Nostr event ID
  videoId      String?                    // YouTube/video ID
  videoUrl     String?                    // Direct video URL

  // Relations
  user         User          @relation(fields: [userId], references: [id])
  lessons      Lesson[]
  draftLessons DraftLesson[]
  purchases    Purchase[]

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([userId])
}
```

### Lesson

Course-to-resource connection with ordering.

```prisma
model Lesson {
  id          String       @id @default(uuid())
  courseId    String?
  resourceId  String?      // Published resource
  draftId     String?      // Or draft resource
  index       Int          // Order within course

  // Relations
  course      Course?      @relation(fields: [courseId], references: [id])
  resource    Resource?    @relation(fields: [resourceId], references: [id])
  draft       Draft?       @relation(fields: [draftId], references: [id])
  userLessons UserLesson[]

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([courseId, index])
  @@unique([courseId, resourceId])
  @@unique([draftId, index])
  @@index([courseId])
  @@index([resourceId])
}
```

## Draft Models

### Draft

Resource draft with full content stored in DB.

```prisma
model Draft {
  id              String        @id @default(uuid())
  userId          String
  type            String        // "video", "document"
  title           String
  summary         String
  content         String        // Full markdown content
  image           String?
  price           Int?          @default(0)
  topics          String[]
  additionalLinks Json          @default(dbgenerated("'[]'::jsonb"))
  videoUrl        String?

  // Relations
  user            User          @relation(fields: [userId], references: [id])
  draftLessons    DraftLesson[]
  lessons         Lesson[]

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}
```

### CourseDraft

Course draft (lessons reference drafts or published resources).

```prisma
model CourseDraft {
  id           String        @id @default(uuid())
  userId       String
  title        String
  summary      String
  image        String?
  price        Int?          @default(0)
  topics       String[]

  // Relations
  user         User          @relation(fields: [userId], references: [id])
  draftLessons DraftLesson[]

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}
```

### DraftLesson

Course draft lesson references.

```prisma
model DraftLesson {
  id            String      @id @default(uuid())
  courseDraftId String
  resourceId    String?     // Published resource
  draftId       String?     // Or draft resource
  index         Int         // Order within course draft

  // Relations
  courseDraft   CourseDraft @relation(fields: [courseDraftId], references: [id])
  resource      Resource?   @relation(fields: [resourceId], references: [id])
  draft         Draft?      @relation(fields: [draftId], references: [id])

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@unique([courseDraftId, index])
  @@unique([courseDraftId, resourceId])
  @@unique([draftId, index])
}
```

## Purchase & Progress Models

### Purchase

Content purchase record with NIP-57 zap audit trail.

```prisma
model Purchase {
  id              String    @id @default(uuid())
  userId          String
  courseId        String?   // Purchased course
  resourceId      String?   // Or purchased resource
  amountPaid      Int       // Total sats credited
  priceAtPurchase Int?      // Price snapshot at claim time
  paymentType     String    @default("zap")  // zap, manual, comped, refund
  zapReceiptId    String?   @unique          // NIP-57 receipt event ID
  invoice         String?                    // bolt11 invoice
  zapReceiptJson  Json?                      // Full receipt(s) for audit
  zapRequestJson  Json?                      // Zap request event

  // Relations
  user            User      @relation(fields: [userId], references: [id])
  course          Course?   @relation(fields: [courseId], references: [id])
  resource        Resource? @relation(fields: [resourceId], references: [id])

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([userId, courseId, resourceId])
  @@unique([userId, courseId])
  @@unique([userId, resourceId])
  @@index([userId])
  @@index([userId, createdAt])
}
```

### UserLesson

Per-lesson progress tracking.

```prisma
model UserLesson {
  id          String    @id @default(uuid())
  userId      String
  lessonId    String
  opened      Boolean   @default(false)
  completed   Boolean   @default(false)
  openedAt    DateTime?
  completedAt DateTime?

  // Relations
  user        User      @relation(fields: [userId], references: [id])
  lesson      Lesson    @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([userId, lessonId])
  @@index([lessonId])
}
```

### UserCourse

Per-course progress and submission tracking.

```prisma
model UserCourse {
  id                String    @id @default(uuid())
  userId            String
  courseId          String
  started           Boolean   @default(false)
  completed         Boolean   @default(false)
  startedAt         DateTime?
  completedAt       DateTime?
  submittedRepoLink String?   // For submission-required courses

  // Relations
  user              User      @relation(fields: [userId], references: [id])
  course            Course    @relation(fields: [courseId], references: [id])

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, courseId])
  @@index([courseId])
}
```

## User Management Models

### Role

Admin and subscription status.

```prisma
model Role {
  id                    String    @id @default(uuid())
  userId                String    @unique
  subscribed            Boolean   @default(false)
  admin                 Boolean   @default(false)
  subscriptionType      String    @default("monthly")
  subscriptionStartDate DateTime?
  lastPaymentAt         DateTime?
  subscriptionExpiredAt DateTime?
  nwc                   String?   // Nostr Wallet Connect URI

  user                  User      @relation(fields: [userId], references: [id])
}
```

### Badge & UserBadge

Course completion badges.

```prisma
model Badge {
  id         String      @id @default(uuid())
  name       String
  noteId     String      @unique  // Badge Nostr event ID
  courseId   String?     @unique  // Optional course relation

  // Relations
  course     Course?     @relation(fields: [courseId], references: [id])
  userBadges UserBadge[]

  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
}

model UserBadge {
  id        String   @id @default(uuid())
  userId    String
  badgeId   String
  awardedAt DateTime @default(now())

  // Relations
  user      User     @relation(fields: [userId], references: [id])
  badge     Badge    @relation(fields: [badgeId], references: [id])

  @@unique([userId, badgeId])
}
```

## Platform Services Models

### PlatformNip05

Platform-managed NIP-05 identifiers.

```prisma
model PlatformNip05 {
  id        String   @id @default(uuid())
  userId    String   @unique
  pubkey    String
  name      String   // username@pleb.school

  user      User     @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### PlatformLightningAddress

Platform-managed Lightning addresses with LND integration.

```prisma
model PlatformLightningAddress {
  id              String  @id @default(uuid())
  userId          String  @unique
  name            String  // username@pleb.school
  allowsNostr     Boolean @default(true)
  description     String?
  maxSendable     BigInt  @default(10000000000)  // millisats
  minSendable     BigInt  @default(1000)         // millisats
  invoiceMacaroon String
  lndCert         String?
  lndHost         String
  lndPort         Int     @default(8080)

  user            User    @relation(fields: [userId], references: [id])
}
```

## Analytics Models

### ViewCounterTotal & ViewCounterDaily

Hybrid KV + database view counting.

```prisma
model ViewCounterTotal {
  key       String   @id        // "resource:uuid" or "course:uuid"
  namespace String              // "resource" or "course"
  entityId  String?             // UUID of content
  path      String?             // URL path
  total     Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ViewCounterDaily {
  id        String   @id @default(cuid())
  key       String              // Same as ViewCounterTotal.key
  day       DateTime            // Date (truncated to day)
  count     Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([key, day])
}
```

## Key Relationships

### Content Ownership
- `User` → `Course[]` (one-to-many)
- `User` → `Resource[]` (one-to-many)
- `User` → `Draft[]`, `CourseDraft[]` (one-to-many)

### Course Structure
- `Course` → `Lesson[]` (ordered by `index`)
- `Lesson` → `Resource` or `Draft` (one-to-one)

### Purchases
- One purchase per user/content combination (unique constraints)
- Course purchase unlocks all lesson resources

### Progress
- `UserLesson` tracks per-lesson progress (opened/completed)
- `UserCourse` tracks course-level progress and submissions

## Database Operations

Always use adapters from `src/lib/db-adapter.ts`:

```typescript
import { CourseAdapter, ResourceAdapter, LessonAdapter } from '@/lib/db-adapter'

// Never access Prisma directly in components
const course = await CourseAdapter.findById(id, userId)
const resource = await ResourceAdapter.findByIdWithNote(id, userId)
```

See [data-architecture.md](./data-architecture.md) for adapter patterns.
