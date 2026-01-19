# Profile System Architecture

## Overview

The profile system implements a sophisticated multi-account management architecture that aggregates data from multiple authentication providers while respecting user preferences for data authority. The system supports linking accounts across Nostr, GitHub, and Email providers with intelligent data prioritization.

## Core Concepts

### Authentication Hierarchy

The system recognizes two primary authentication paradigms:

#### 🔵 Nostr-First Accounts
- **Providers**: `nostr` (NIP-07 extension), `anonymous`, `recovery`
- **Characteristics**: 
  - Nostr profile is the source of truth
  - Profile syncs from Nostr relays on sign-in
  - NIP-07 users control keys via browser extension; anonymous/recovery use server-held or user-supplied keys (encrypted at rest)
  - Basic fields (name, email) are read-only in settings

#### 🟠 OAuth-First Accounts  
- **Providers**: Email magic links, GitHub OAuth
- **Characteristics**:
  - Platform manages profile data
  - Can edit all profile fields directly
  - Background Nostr capabilities with ephemeral keys
  - Profile stored in database

### Automatic Promotions

Linking flows automatically migrate users along the chain:
- If `primaryProvider` is unset, the first linked provider becomes primary and sets `profileSource` accordingly.
- Linking Nostr (NIP-07) always sets `primaryProvider/profileSource` to `nostr`, replaces `User.pubkey`, clears `privkey`, and triggers a Nostr profile sync (best-effort).
- Anonymous → OAuth-first: linking email/GitHub switches `primaryProvider/profileSource` to OAuth while keeping the server-managed keypair.
- Linking additional OAuth providers does **not** change the current primary unless it was `anonymous`.
- Unlinking the primary provider recomputes `primaryProvider/profileSource`; removing the last Nostr-first provider can switch the profile source back to OAuth.

### Anonymous Bootstrap Behavior
- Anonymous sign-ins generate an `anon_XXXX` username and DiceBear avatar as placeholders (from `config/auth.json` `usernamePrefix` + `defaultAvatar`).
- These placeholders are explicitly treated as "unset" during aggregation: any linked OAuth provider with real profile data overrides them immediately.
- Once the user updates their Nostr profile (via sync or settings), those non-placeholder values regain priority because the profile remains Nostr-first unless they switch sources.
- When richer data replaces the placeholder, the system backfills the `User.username`, `User.avatar`, and `User.email` columns so settings forms stay in sync with what the public profile shows.
- Anonymous keys are stored encrypted at rest (`PRIVKEY_ENCRYPTION_KEY`).
- Linking a real Nostr account erases the platform-managed private key to enforce user custody from that point onward.

### Anonymous Session Persistence
Anonymous users can persist their session across browser restarts using a secure reconnect token system:

**Storage Format (localStorage):**
```typescript
// Secure format - no private keys stored (matches PersistedAnonymousIdentity type)
{ reconnectToken: "random_hex", pubkey: "...", userId: "...", updatedAt: 1704067200000 }
```

**Security Properties:**
- Token is random, cannot derive private key or sign Nostr events
- Database stores only SHA-256 hash (`User.anonReconnectTokenHash`), not plaintext
- Token rotates on every successful authentication (limits stolen token window)
- O(1) lookup via unique index on hash (not O(n) scan)

**Reconnection Flow:**
1. Client sends reconnect token with anonymous sign-in
2. Server computes `hashToken(token)` and queries by hash (O(1) indexed lookup)
3. On success: generate new token, update hash in database
4. Client stores new rotated token

**Edge Case:** If DB update succeeds but response is lost (network failure), client has stale token and next login fails. This is accepted for ephemeral anonymous accounts - user can create a new anonymous account.

**Legacy Migration:**
Users with old localStorage format (privkey) are automatically migrated on next login - server validates privkey, generates token, client stores new format. This migration is intentionally silent (no user notification) since anonymous accounts are ephemeral and the security upgrade is transparent to users.

### Profile Source Priority

Users can configure how their profile data is prioritized:

```typescript
// Nostr-First Priority
nostr → current DB profile → oauth providers

// OAuth-First Priority
current DB profile → oauth providers → nostr
```

#### What is "Current DB Profile"?

The "current DB profile" refers to data stored directly in the `User` table columns:
- `username`, `avatar`, `email`, `banner`, `nip05`, `lud16`, `pubkey`

> **Note**: The schema also has a `displayName` column, but it's currently unused by the profile aggregator.

This data is populated from:
1. **Provider syncs** - When users log in, successful provider fetches may backfill empty User columns
2. **Manual edits** - Users can directly edit profile fields via the settings page
3. **Registration data** - Initial values set during account creation

In the aggregation logic (`src/lib/profile-aggregator.ts`), current DB profile is represented as a pseudo-provider with `provider: 'current'`. When displayed in the UI, it's labeled as `'profile'` (the source badge shown to users).

**Aggregator field mapping** (see `src/lib/profile-aggregator.ts` lines 309-324):
```typescript
const currentData: LinkedAccountData = {
  provider: 'current',
  providerAccountId: user.id,
  data: {
    name: user.username,      // username used for display name
    username: user.username,
    email: user.email,
    image: user.avatar,       // avatar → image
    banner: user.banner,
    nip05: user.nip05,
    lud16: user.lud16,
    pubkey: user.pubkey
  },
  isConnected: true,
  isPrimary: true
}
```

This mapping means `username` serves double duty as both the username and display name for the "current" profile source.

**Why "current" sits between nostr and oauth in Nostr-first mode:**
- Nostr data is fetched live and takes highest priority for Nostr-first users
- Current DB profile serves as a cached fallback when Nostr fetch fails or fields are missing
- It also captures manual user edits that should override stale OAuth data
- OAuth providers are lowest priority since Nostr-first users consider that data secondary

**Interaction with `profileSource`:**
- `profileSource: 'nostr'` → Uses Nostr-first priority order
- `profileSource: 'oauth'` → Uses OAuth-first priority order (current DB profile is highest)
- The `isNostrFirstProfile()` helper determines which order to use based on `profileSource` and `primaryProvider`

## Data Architecture

### Profile Aggregation

The system aggregates profile data from all linked accounts into a unified structure:

```typescript
interface AggregatedProfile {
  // Core fields with source tracking
  name?: { value: string; source: string }
  email?: { value: string; source: string }
  username?: { value: string; source: string }
  image?: { value: string; source: string }
  banner?: { value: string; source: string }
  about?: { value: string; source: string }
  
  // Social links
  website?: { value: string; source: string }
  github?: { value: string; source: string }
  twitter?: { value: string; source: string }
  location?: { value: string; source: string }
  company?: { value: string; source: string }
  
  // Nostr specific
  pubkey?: { value: string; source: string }
  nip05?: { value: string; source: string }
  lud16?: { value: string; source: string }
  
  // All linked accounts
  linkedAccounts: LinkedAccountData[]
  
  // Metadata
  primaryProvider: string | null
  profileSource: string | null
  totalLinkedAccounts: number
}
```

### Data Flow

#### Profile Display Flow
1. User visits profile tab
2. Component fetches `/api/profile/aggregated`
3. API aggregates data from all sources:
   - Current session data from database
   - GitHub profile via API (if linked)
   - Nostr profile from relays (if linked)
4. Returns unified profile with source tracking
5. UI displays fields with provider badges

#### Settings Update Flow
1. User edits fields in settings
2. Calls server actions based on field type:
   - `updateBasicProfile` for name/email (OAuth-first only)
   - `updateEnhancedProfile` for NIP-05/Lightning/banner (all users)
3. Preferences and primary provider managed via `/api/account/preferences` and `/api/account/primary`
4. Data saved to database
5. Page revalidated to show changes

## Implementation Components

### Backend Services

#### Profile Aggregator (`/src/lib/profile-aggregator.ts`)
Core aggregation logic that:
- Fetches data from multiple sources
- Implements priority-based field selection
- Handles provider-specific API calls
- Returns unified profile with source tracking

```typescript
export async function getAggregatedProfile(userId: string): Promise<AggregatedProfile> {
  // Fetch user with linked accounts
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true }
  })
  
  // Aggregate from each provider
  for (const account of user.accounts) {
    switch (account.provider) {
      case 'github':
        // Fetch from GitHub API
      case 'nostr':
        // Fetch from Nostr relays
      case 'email':
        // Use email data
    }
  }
  
  // Apply priority-based selection
  // Return aggregated profile
}
```

#### Database Schema
```prisma
model User {
  id                     String    @id @default(uuid())
  pubkey                 String?   @unique
  privkey                String?   // Encrypted with PRIVKEY_ENCRYPTION_KEY
  email                  String?   @unique
  username               String?   @unique
  avatar                 String?
  banner                 String?
  nip05                  String?
  lud16                  String?

  // Account linking fields
  primaryProvider        String?   // Primary authentication provider
  profileSource          String?   @default("oauth") // "nostr" or "oauth"
  anonReconnectTokenHash String?   // SHA-256 hash for anonymous session persistence

  accounts               Account[]
  sessions               Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  provider          String
  providerAccountId String
  access_token      String?
  refresh_token     String?
  
  user              User    @relation(fields: [userId], references: [id])
  
  @@unique([provider, providerAccountId])
}
```

### Frontend Components

#### Enhanced Profile Display (`/src/app/profile/components/enhanced-profile-display.tsx`)
Main profile display component featuring:
- Aggregated data from all linked accounts
- Visual provider badges for each field
- Linked accounts overview
- Account configuration display
- Loading states with skeleton UI
- Copy functionality for keys/identifiers

#### Simple Settings (`/src/app/profile/components/simple-settings.tsx`)
Streamlined settings component with:
- Account-type detection derived from `profileSource`, `primaryProvider`, and `session.provider`
- Basic profile editing (OAuth-first only)
- Enhanced profile fields (all users)
- Profile source configuration
- Manual sync from GitHub/Nostr/Email (email sync backfills `User.email` when missing or out of sync)
- Real-time validation and feedback
- Contextual messaging for anonymous and Nostr-first accounts (e.g., “Managed via Nostr relays”)

#### Enhanced Settings (`/src/app/profile/components/enhanced-settings.tsx`)
Full-featured settings experience with:
- Richer UI/UX, inline provider hints, and granular sync actions
- Uses `/api/profile/sync` to respect `profileSource` rules
- Mirrors the same validation rules as `simple-settings`

#### Linked Accounts Manager (`/src/components/account/linked-accounts.tsx`)
Account linking interface providing:
- Available provider display
- Current provider detection and disabling
- Provider-specific linking flows
- Automatic redirect back to `/profile` after successful linking so every tab (and the sticky header) reloads in a consistent state

### Identity Synchronisation Events

- `src/lib/profile-events.ts` defines `profile:updated`; the header listens and refreshes `/api/profile/aggregated`, persisting avatar/name in localStorage.
- `dispatchProfileUpdatedEvent` is fired from `LinkedAccountsManager` and `ProfileEditForms` after linking/unlinking or profile edits.

## Visual Design System

### Provider Badges

Badges are rendered via `ProviderBadge` in `enhanced-profile-display.tsx` as outline `Badge` elements with an icon + label. (Provider color values exist in `providerConfig`, but they are not applied in the badge UI today.)

| Provider | Label | Icon | Color |
|----------|-------|------|-------|
| nostr | Nostr | Key | blue |
| github | GitHub | GitHub | gray |
| email | Email | Mail | green |
| profile | Profile | User | purple |
| current | Current | User | orange |

**Note on `profile` vs `current`**: Both refer to the "current DB profile" (data stored in the User table). The difference is contextual:
- `current` appears as a fallback in `enhanced-profile-display.tsx` when no aggregated profile exists
- `profile` appears when data flows through `profile-aggregator.ts`, which transforms `source: 'current'` → `source: 'profile'` (line 344)

In practice, most users see `profile` (purple) since aggregation runs on page load. The `current` (orange) badge only appears in edge cases where aggregation hasn't occurred.

### UI Organization

#### Profile Tab
- **Header**: Avatar, name, account type badges
- **Basic Information**: Name, email, username, location
- **Nostr Information**: Public key, NIP-05, Lightning
- **Extended Profile**: About, website, social links
- **Linked Accounts**: Overview of all connections
- **Account Configuration**: Settings summary

#### Settings Tab
- **Account Type**: Visual indicator of Nostr-first vs OAuth-first
- **Basic Profile**: Editable fields with provider badges
- **Enhanced Profile**: Nostr-specific configuration
- **Profile Configuration**: Source priority selector
- **Sync Options**: Manual sync buttons per provider

#### Accounts Tab
- **Link Buttons**: One per provider type
- **Current Provider**: Disabled with tooltip
- **Email Dialog**: Verification flow for email
- **Success Messages**: Toast notifications

## Security Implementation

### Account Linking Security

1. **Email Verification**
   - Sends 6-digit code + link to `/verify-email?ref=...`
   - User submits code via POST `/api/account/verify-email`
   - One-time use with 1-hour expiration; record deleted on success/expiry

2. **OAuth State Validation**
   - Base64-encoded state with strict length + JSON schema validation
   - Session/userId verification on callback
   - Provider account uniqueness enforced

3. **Session Requirements**
   - Most operations require authenticated session; `/api/account/verify-email` is token-based and unauthenticated
   - User ID verification for all updates

### Data Protection

1. **Input Validation**
   - Zod schemas on account/profile endpoints
   - Email inputs normalized via `sanitizeEmail` where applicable
   - Prisma used for standard DB access (plus parameterized raw queries where needed)

2. **Nostr Profile Field Validation**
   Profile fields synced from Nostr are validated before storage:
   - **username**: Max 256 characters, control characters removed, whitespace normalized
   - **avatar/banner**: Must be valid http/https URLs, max 2048 characters
   - **nip05**: Must match `user@domain.tld` format, max 320 characters
   - **lud16**: Must match Lightning address format `user@domain.tld`, max 320 characters

   Validation implemented in `src/lib/nostr-profile.ts` and `src/app/api/account/sync/route.ts`.

3. **Provider Verification**
   - Verify provider exists before operations
   - Check account ownership
   - Prevent duplicate linkings

4. **Key Handling**
   - Ephemeral private keys are encrypted at rest via `PRIVKEY_ENCRYPTION_KEY`
   - Nostr-first links clear stored privkeys to enforce user custody

## Performance Optimizations

### Fetch & Retry Strategy
- No server-side cache for `/api/profile/aggregated` at present
- Provider data fetched on demand with retry/backoff and 429 handling (GitHub)
- Skeleton loading states during fetch in the UI

### Query Optimization
- Batch fetch linked accounts
- Single query for user + accounts
- Provider fetches are sequential per account in `getAggregatedProfile` (no parallel fan-out yet)
- Minimal database round trips

## User Experience Features

### Smart Defaults
- Auto-detect current provider
- Intelligent field prioritization
- Contextual help text
- Progressive disclosure

### Visual Feedback
- Loading skeletons
- Toast notifications
- Disabled states with tooltips
- Success/error indicators


## Suggested Manual Checks

### Profile Display
- Aggregation from multiple sources
- Provider badge display
- Loading states and error handling
- Copy-to-clipboard functionality
- Responsive layout

### Settings
- Field editing based on account type
- Provider badges on fields
- Profile source configuration
- Manual sync functionality
- Form validation + error messages

### Account Linking
- Nostr via NIP-07
- Email with verification
- GitHub OAuth flow
- Current provider disabled
- Unlink functionality

### Data Integrity
- Profile source priority respected
- Primary provider preserved
- Proper data aggregation
  
