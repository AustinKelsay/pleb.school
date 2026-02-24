# Authentication System

NextAuth-based authentication with dual identity architecture supporting Nostr-first and OAuth-first accounts. Located in `src/lib/auth.ts`.

## Overview

The authentication system supports multiple providers with different identity paradigms:

- **Nostr-First**: Identity comes from Nostr (NIP-07 extension, anonymous)
- **OAuth-First**: Identity comes from OAuth providers (email, GitHub)

All users get Nostr capabilities regardless of login method.

## Providers

### Nostr-First Providers

| Provider | ID | Description |
|----------|-----|-------------|
| NIP-07 | `nostr` | Browser extension (Alby, nos2x, etc.) |
| Anonymous | `anonymous` | Server-generated keypair |
| Recovery | `recovery` | Private key recovery |

**Behavior:**
- Nostr profile is source of truth
- Profile syncs from relays on every login
- Database caches Nostr profile data
- Changes to Nostr profile automatically sync

### OAuth-First Providers

| Provider | ID | Description |
|----------|-----|-------------|
| Email | `email` | Magic link authentication |
| GitHub | `github` | GitHub OAuth |

**Behavior:**
- OAuth profile is source of truth
- Ephemeral Nostr keypairs generated for protocol access
- No automatic sync from Nostr
- Platform identity drives Nostr identity

## NIP-98 HTTP Authentication

NIP-07 login uses [NIP-98](https://nips.nostr.com/98) to cryptographically verify pubkey ownership, preventing impersonation attacks.

### Client Flow (`src/app/auth/signin/page.tsx`)

```typescript
// 1. Get pubkey from extension
const pubkey = await window.nostr.getPublicKey()

// 2. Create NIP-98 auth event (kind 27235)
const authEvent = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['u', 'http://localhost:3000/api/auth/callback/nostr'],
    ['method', 'POST']
  ],
  content: ''
}

// 3. Sign with extension
const signedEvent = await window.nostr.signEvent(authEvent)

// 4. Submit to server
signIn('nostr', { pubkey, signedEvent: JSON.stringify(signedEvent) })
```

### Server Verification (`src/lib/auth.ts:263-370`)

```typescript
// 1. Parse NIP-98 event
const event = JSON.parse(signedEvent)

// 2. Verify event ID matches hash of fields (prevents tag substitution attacks)
const computedId = await getEventHash(event)
if (computedId !== event.id) throw new Error('Event ID mismatch')

// 3. Verify signature
const isValid = await verifySignature(event.id, event.sig, event.pubkey)

// 4. Verify pubkey matches
if (event.pubkey !== pubkey) throw new Error('Pubkey mismatch')

// 5. Check timestamp (asymmetric window: 30s future / 60s past)
const now = Math.floor(Date.now() / 1000)
const eventAge = now - event.created_at
if (eventAge < -30 || eventAge > 60) throw new Error('Event expired')

// 6. Validate URL tag
const urlTag = event.tags.find(t => t[0] === 'u')
if (!urlTag || !urlTag[1].includes('/api/auth/callback/nostr'))
  throw new Error('Invalid URL')

// 7. Validate method tag
const methodTag = event.tags.find(t => t[0] === 'method')
if (methodTag?.[1] !== 'POST') throw new Error('Invalid method')
```

### Security Properties

| Check | What It Prevents |
|-------|------------------|
| Event ID verification | Tag substitution attacks (ensures signed data matches claimed tags) |
| Signature verification | Impersonation (proves key ownership) |
| Timestamp window (-30s/+60s) | Replay attacks (30s future for clock skew, 60s past) |
| URL tag validation | Cross-site replay |
| Method tag validation | Request method confusion |

**Note on NIP-98 `payload` tag:** NIP-98 specifies that clients SHOULD include a `payload` tag with the SHA-256 hash of the request body for POST requests, and servers MAY validate it. Our implementation omits this tag—the auth callback body contains only the pubkey and signed event, which are already verified through signature and event ID checks. The payload tag would provide defense-in-depth against body tampering but is not strictly required per spec (SHOULD/MAY language).

## Anonymous Authentication

Anonymous users get a server-generated Nostr keypair for immediate participation.

### Rate Limits

Anonymous account creation uses dual-bucket rate limiting to prevent abuse:

| Bucket | Limit | Purpose |
|--------|-------|---------|
| Per-IP | 5/hour | Prevents single-source abuse |
| Global | 50/hour | Backstop for distributed attacks |

Both limits must pass for account creation. See [rate-limiting.md](./rate-limiting.md) for implementation details.

### Anonymous Flow

1. Client requests anonymous sign-in
2. **Rate limit check**: Per-IP bucket checked first, then global
3. Server generates new keypair: `generateKeypair()`
4. Private key encrypted: `encryptPrivkey(privkey)`
5. User created with `primaryProvider: 'anonymous'`
6. Reconnect token generated for session persistence

### Reconnect Token System

Anonymous sessions persist across browser restarts without storing private keys client-side.

**Security Properties:**
- Token is random, cannot derive private key
- Database stores only SHA-256 hash
- Token rotates on every successful login
- O(1) lookup via unique index

### Reconnect Storage: httpOnly Cookie Only

The reconnect token is stored in an **httpOnly cookie** (`anon-reconnect-token`):

- Cannot be accessed by JavaScript (XSS-protected)
- Set via `/api/auth/anon-reconnect` API after successful login
- Server reads directly from cookie during reconnection

**Cookie Configuration:**
```typescript
{
  httpOnly: true,                              // Cannot be accessed by JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production (allows HTTP in development)
  sameSite: 'lax',                             // CSRF protection
  path: '/',                                   // Available site-wide
  maxAge: 60 * 60 * 24 * 365                   // 1 year
}
```

**API Endpoints:**
- `POST /api/auth/anon-reconnect`: Set httpOnly cookie from session
- `DELETE /api/auth/anon-reconnect`: Clear httpOnly cookie

**Reconnection Flow:**
```typescript
// 1. Server checks for reconnect token in the httpOnly cookie
const reconnectToken = cookieStore.get('anon-reconnect-token')?.value

// 2. Server computes hash and queries
const hash = hashToken(reconnectToken)
const user = await prisma.user.findUnique({
  where: { anonReconnectTokenHash: hash }
})

// 3. Generate new rotated token
const newToken = generateReconnectToken()
await prisma.user.update({
  where: { id: user.id },
  data: { anonReconnectTokenHash: hashToken(newToken) }
})

// 4. Return new token to client, client calls API to set new cookie
await fetch('/api/auth/anon-reconnect', { method: 'POST', credentials: 'include' })
```

**Security Benefits:**
- XSS attacks cannot steal the httpOnly cookie
- Token rotation limits window of exposure for any compromised token
- Anonymous accounts have limited value (ephemeral platform identity)

## Email Authentication

Magic link authentication with rate limiting.

### SMTP Configuration Safety

- SMTP parsing and validation is centralized in `src/lib/email-config.ts` and reused by:
  - NextAuth `EmailProvider` (magic links)
  - `/api/account/send-link-verification` (account-link verification emails)
- In production, invalid or missing SMTP env vars now fail fast when email auth is enabled.
- Outside production, if SMTP config is incomplete, the NextAuth email provider is skipped to avoid late runtime failures.

### Flow

1. User enters email
2. Server generates token, sends magic link
3. User clicks link
4. Server verifies token, creates/updates user
5. Ephemeral Nostr keypair generated if needed

### Rate Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `AUTH_MAGIC_LINK` | 5 per 15 min | Prevents email flooding |
| `EMAIL_SEND` | 3 per hour | Prevents spam |

## GitHub OAuth

Standard OAuth 2.0 flow with profile sync.

### Configuration

```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Separate app for account linking (optional)
GITHUB_LINK_CLIENT_ID=link-client-id
GITHUB_LINK_CLIENT_SECRET=link-client-secret
```

### Flow

1. Redirect to GitHub authorization
2. GitHub redirects back with code
3. Server exchanges code for tokens
4. Fetch GitHub profile
5. Create/update user with OAuth data
6. Generate Nostr keypair if needed

## Session Management

### Session Structure

```typescript
interface Session {
  user: {
    id: string
    pubkey?: string
    hasEphemeralKeys?: boolean  // True if user has platform-managed keys (anonymous, email, github)
    email?: string
    name?: string
    image?: string
    provider: string
    providerAccountId: string
    isAdmin: boolean
    primaryProvider?: string
    profileSource?: string
  }
  expires: string
}
```

### JWT Callbacks

```typescript
// jwt callback - build token
// Only detect whether user has ephemeral keys; never include the actual key
async jwt({ token, user, account }) {
  if (user) {
    token.userId = user.id
    token.pubkey = user.pubkey
    token.provider = account?.provider

    // For non-NIP07 providers, check if user has platform-managed keys
    if (account?.provider && !['nostr'].includes(account.provider)) {
      // Fetch user record to check for stored privkey
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { privkey: true }
      })
      // Set flag indicating ephemeral keys exist (never expose the key itself)
      token.hasEphemeralKeys = !!dbUser?.privkey
    }
  }
  return token
}

// session callback - expose to client
// Only expose the hasEphemeralKeys flag, not the key itself
async session({ session, token }) {
  session.user.id = token.userId
  session.user.pubkey = token.pubkey
  session.user.provider = token.provider
  session.user.hasEphemeralKeys = token.hasEphemeralKeys
  return session
}
```

## Private Key Handling

### Encryption at Rest

Private keys stored encrypted using AES-256-GCM:

```typescript
// src/lib/privkey-crypto.ts
import { encryptPrivkey, decryptPrivkey } from '@/lib/privkey-crypto'

// Encrypt before storing
const encrypted = encryptPrivkey(privkey)
await prisma.user.update({
  data: { privkey: encrypted }
})

// Decrypt for signing
const privkey = decryptPrivkey(user.privkey)
```

### Key Environment Variable

```env
PRIVKEY_ENCRYPTION_KEY=your-64-character-hex-key
```

**Note**: The key must be a 64-character hexadecimal string (representing 32 bytes / 256 bits). Generate with `openssl rand -hex 32`.

### Signing Mode Detection

```typescript
// Server-side signing if privkey exists
if (user.privkey) {
  const decrypted = decryptPrivkey(user.privkey)
  const signed = await signEvent(event, decrypted)
}

// NIP-07 signing if no privkey
else {
  // Client must sign with extension
  const signed = await window.nostr.signEvent(event)
}
```

### Ephemeral Key Security Model

Private keys are **never** included in JWT/session tokens. Instead, the session only contains a `hasEphemeralKeys` boolean flag. When signing is needed, keys are fetched on-demand via the `/api/profile/recovery-key` endpoint.

**Why On-Demand Fetching:**
- Reduces attack surface (key not in every JWT)
- Rate-limited endpoint prevents abuse
- Cache-Control headers prevent caching
- Key only fetched when explicitly needed

**Threat Model for Ephemeral Keys (Anonymous, Email, GitHub):**
- Keys are **platform-generated**, not user-controlled
- Compromise loses a throwaway platform identity, not user's real Nostr identity
- Keys fetched on-demand for signing operations (zaps, reactions, publishing)
- Profile UI fetches key only when user explicitly requests to view/copy it

**Threat Model for NIP-07 Keys (User-Controlled):**
- Keys are user-controlled (their real Nostr identity)
- Compromise would be catastrophic (identity theft)
- User's browser extension handles all signing
- Platform **never** sees or stores these keys
- `hasEphemeralKeys` is always `false` for NIP-07 users

**Code Enforcement** (`src/lib/auth.ts`):
```typescript
// Only set hasEphemeralKeys flag for non-NIP07 providers
if (account?.provider && !['nostr'].includes(account.provider)) {
  // Fetch user from database to check for ephemeral keys
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      privkey: true,
      username: true,
      avatar: true,
      nip05: true,
      lud16: true,
      banner: true
    }
  })
  token.hasEphemeralKeys = !!dbUser?.privkey
}
```

**Client-Side Signing Flow:**
```typescript
// Check if user can sign with ephemeral keys
if (session.user.hasEphemeralKeys) {
  // Fetch key on-demand from API
  const response = await fetch('/api/profile/recovery-key')
  const { recoveryKey } = await response.json()
  // Use key for signing, then discard
  const signed = await signEvent(event, recoveryKey)
}
```

## Account Linking

Users can link multiple authentication providers. See [profile-system-architecture.md](./profile-system-architecture.md) for details.

### Linking Behavior

| Action | Result |
|--------|--------|
| Anonymous → OAuth | Switch to OAuth-first, keep keypair |
| Anonymous → Nostr | Promote to Nostr-first, clear stored privkey |
| OAuth → Nostr | Promote to Nostr-first, clear stored privkey |
| Nostr → OAuth | Remain Nostr-first, OAuth as recovery |

### Provider Identity Helpers

```typescript
// src/lib/account-linking.ts
import {
  isNostrFirstProvider,
  isOAuthFirstProvider,
  getProfileSourceForProvider
} from '@/lib/account-linking'

isNostrFirstProvider('nostr')     // true
isNostrFirstProvider('anonymous') // true
isOAuthFirstProvider('github')    // true

getProfileSourceForProvider('nostr')  // 'nostr'
getProfileSourceForProvider('github') // 'oauth'
```

## Admin Detection

Admins are identified by pubkey in `config/admin.json`:

```typescript
// src/lib/admin-utils.ts
import { isAdmin } from '@/lib/admin-utils'

const isUserAdmin = await isAdmin(session.user.pubkey)
```

## Configuration

### config/auth.json

```json
{
  "providers": {
    "email": {
      "enabled": true,
      "maxAge": 3600
    },
    "github": {
      "enabled": true
    },
    "nostr": {
      "enabled": true
    },
    "anonymous": {
      "enabled": true,
      "usernamePrefix": "anon_",
      "usernameLength": 8,
      "defaultAvatar": "https://api.dicebear.com/7.x/shapes/svg?seed="
    }
  },
  "ui": {
    "showProviderIcons": true,
    "allowAccountLinking": true
  }
}
```

## Error Handling

All authentication errors return generic messages to prevent information leakage:

```typescript
// Server logs detailed error
console.error('NIP-98 validation failed:', error.message)

// Client receives generic message
throw new Error('Authentication failed')
```

## Related Documentation

- [profile-system-architecture.md](./profile-system-architecture.md) - Account linking and profile management
- [profile-api-reference.md](./profile-api-reference.md) - Profile and account APIs
- [rate-limiting.md](./rate-limiting.md) - Rate limit configuration
- [security-patterns.md](./security-patterns.md) - Security patterns and audit logging
