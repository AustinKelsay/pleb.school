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

### Server Verification (`src/lib/auth.ts:263-332`)

```typescript
// 1. Parse NIP-98 event
const event = JSON.parse(signedEvent)

// 2. Verify signature
const isValid = await verifySignature(event)

// 3. Verify pubkey matches
if (event.pubkey !== pubkey) throw new Error('Pubkey mismatch')

// 4. Check timestamp (60 second window - NIP-98 suggests "reasonable", we use 60s)
const age = now - event.created_at
if (age > 60) throw new Error('Event expired')

// 5. Validate URL tag
const urlTag = event.tags.find(t => t[0] === 'u')
if (!urlTag || !urlTag[1].includes('/api/auth/callback/nostr'))
  throw new Error('Invalid URL')

// 6. Validate method tag
const methodTag = event.tags.find(t => t[0] === 'method')
if (methodTag?.[1] !== 'POST') throw new Error('Invalid method')
```

### Security Properties

| Check | What It Prevents |
|-------|------------------|
| Signature verification | Impersonation (proves key ownership) |
| Timestamp window (60s) | Replay attacks (NIP-98 suggests "reasonable window", we use 60s) |
| URL tag validation | Cross-site replay |
| Method tag validation | Request method confusion |

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

### Dual Storage: httpOnly Cookie + localStorage (XSS Mitigation)

The reconnect token is stored in **two locations** for security and backward compatibility:

1. **httpOnly Cookie** (`anon-reconnect-token`): Primary secure storage
   - Cannot be accessed by JavaScript (XSS-protected)
   - Set via `/api/auth/anon-reconnect` API after successful login
   - Server reads directly from cookie during reconnection

2. **localStorage** (legacy, being phased out): Backward compatibility
   - Still set during transition period
   - Will be removed in future versions once all clients have httpOnly cookie

**Cookie Configuration:**
```typescript
{
  httpOnly: true,          // Cannot be accessed by JavaScript
  secure: true,            // HTTPS only in production
  sameSite: 'lax',         // CSRF protection
  path: '/',               // Available site-wide
  maxAge: 60 * 60 * 24 * 365  // 1 year
}
```

**API Endpoints:**
- `POST /api/auth/anon-reconnect`: Set httpOnly cookie from session
- `DELETE /api/auth/anon-reconnect`: Clear httpOnly cookie

**Reconnection Flow:**
```typescript
// 1. Server checks for token (cookie takes priority, localStorage as fallback)
const reconnectToken = credentials?.reconnectToken ||  // localStorage (legacy)
  cookieStore.get('anon-reconnect-token')?.value       // httpOnly cookie (secure)

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
- Even if localStorage is compromised, cookie-based reconnection remains secure
- Token rotation limits window of exposure for any compromised token
- Anonymous accounts have limited value (ephemeral platform identity)

## Email Authentication

Magic link authentication with rate limiting.

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
    privkey?: string  // Only for server-side signing accounts
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
async jwt({ token, user, account }) {
  if (user) {
    token.userId = user.id
    token.pubkey = user.pubkey
    token.provider = account?.provider
    // Only include privkey for accounts needing server-side signing
    if (user.privkey && !isNip07User(account?.provider)) {
      token.privkey = user.privkey
    }
  }
  return token
}

// session callback - expose to client
async session({ session, token }) {
  session.user.id = token.userId
  session.user.pubkey = token.pubkey
  session.user.provider = token.provider
  session.user.privkey = token.privkey  // Only if present
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
PRIVKEY_ENCRYPTION_KEY=your-32-character-minimum-secret
```

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

### Why Ephemeral Keys Are Exposed in Session (Intentional Design)

The privkey is included in JWT/session tokens for ephemeral accounts. This is an intentional design choice, not a security oversight.

**Threat Model for Ephemeral Keys (Anonymous, Email, GitHub):**
- Keys are **platform-generated**, not user-controlled
- Compromise loses a throwaway platform identity, not user's real Nostr identity
- No alternative exists (user has no NIP-07 extension to delegate signing to)
- Enables client-side signing for better UX
- JWT uses httpOnly, secure, sameSite cookies

**Threat Model for NIP-07 Keys (User-Controlled):**
- Keys are user-controlled (their real Nostr identity)
- Compromise would be catastrophic (identity theft)
- User's browser extension handles all signing
- Platform **never** sees or stores these keys

**Code Enforcement** (`src/lib/auth.ts:833`):
```typescript
// Only include privkey for non-NIP07 providers
if (account?.provider && !['nostr'].includes(account.provider)) {
  token.privkey = decryptPrivkey(dbUser.privkey)
}
```

NIP-07 users who bring their own Nostr identity are fully protected. Ephemeral users get client-side signing capability for their platform-generated throwaway keys.

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
