# Profile System API Reference

## Table of Contents
- [Profile APIs](#profile-apis)
- [Profile Content APIs](#profile-content-apis)
- [Profile Nostr APIs](#profile-nostr-apis)
- [Account Management APIs](#account-management-apis)
- [Account Preferences APIs](#account-preferences-apis)
- [Sync APIs](#sync-apis)
- [OAuth Linking APIs](#oauth-linking-apis)
- [Email Linking APIs](#email-linking-apis)
- [Server Actions](#server-actions)
- [Error Handling](#error-handling)
- [Environment Variables](#environment-variables)

## Profile APIs

### GET /api/profile/aggregated

Fetches aggregated profile data from all linked accounts with source tracking.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "name": { 
    "value": "John Doe", 
    "source": "github" 
  },
  "email": { 
    "value": "john@example.com", 
    "source": "email" 
  },
  "username": { 
    "value": "johndoe", 
    "source": "nostr" 
  },
  "image": { 
    "value": "https://avatars.githubusercontent.com/...", 
    "source": "github" 
  },
  "banner": {
    "value": "https://example.com/banner.jpg",
    "source": "nostr"
  },
  "about": {
    "value": "Bitcoin developer and educator",
    "source": "nostr"
  },
  "website": {
    "value": "https://johndoe.com",
    "source": "github"
  },
  "location": {
    "value": "San Francisco, CA",
    "source": "github"
  },
  "company": {
    "value": "Bitcoin Corp",
    "source": "github"
  },
  "github": {
    "value": "johndoe",
    "source": "github"
  },
  "twitter": {
    "value": "@johndoe",
    "source": "nostr"
  },
  "pubkey": {
    "value": "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca",
    "source": "nostr"
  },
  "nip05": {
    "value": "john@nostr.example",
    "source": "nostr"
  },
  "lud16": {
    "value": "john@getalby.com",
    "source": "nostr"
  },
  "linkedAccounts": [
    {
      "provider": "github",
      "providerAccountId": "123456",
      "data": {
        "name": "John Doe",
        "email": "john@example.com",
        "username": "johndoe",
        "image": "https://...",
        "location": "San Francisco, CA",
        "company": "Bitcoin Corp"
      },
      "isConnected": true,
      "isPrimary": true,
      "alternatives": {
        "name": { "value": "John Doe", "source": "github" }
      }
    },
    {
      "provider": "nostr",
      "providerAccountId": "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca",
      "data": {
        "name": "John Doe",
        "about": "Bitcoin developer",
        "website": "https://johndoe.com",
        "nip05": "john@nostr.example",
        "lud16": "john@getalby.com",
        "pubkey": "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"
      },
      "isConnected": true,
      "isPrimary": false
    }
  ],
  "primaryProvider": "github",
  "profileSource": "oauth",
  "totalLinkedAccounts": 2
}
```

**Error Responses**:
- `401 Unauthorized` - No valid session
- `500 Internal Server Error` - Failed to aggregate data

## Profile Content APIs

### GET /api/profile/content

Returns the current user's published courses/resources plus basic revenue stats.

**Authentication**: Required

**Query Parameters**:
- `type` (optional): `all` | `courses` | `resources` (default `all`)
- `limit` (optional): max 200 items returned per type

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "resources": [],
    "courses": [],
    "stats": {
      "totalResources": 0,
      "totalCourses": 0,
      "paidResources": 0,
      "freeResources": 0,
      "paidCourses": 0,
      "freeCourses": 0,
      "totalPurchases": 0,
      "totalRevenueSats": 0,
      "lastUpdatedAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

## Profile Nostr APIs

### GET /api/profile/nostr

Fetches the latest Nostr profile metadata for the current session pubkey.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "profile": {
    "name": "Alice",
    "picture": "https://...",
    "banner": "https://...",
    "nip05": "alice@nostr.example",
    "lud16": "alice@getalby.com"
  }
}
```

**Error Responses**:
- `400 Bad Request` - No Nostr pubkey on the session
- `500 Internal Server Error` - Relay fetch failed

## Account Management APIs

### GET /api/profile/recovery-key

Fetches the user's ephemeral private key for account recovery, backup, or client-side signing.

**Authentication**: Required

**Rate Limit**: 10 requests per 15 minutes per user

**Response**: `200 OK`
```json
{
  "recoveryKey": "hex-encoded-private-key"
}
```

**Security Headers** (all responses):
- `Cache-Control: no-store, no-cache, must-revalidate, private`
- `Pragma: no-cache`
- `Expires: 0`

**Error Responses**:
- `401 Unauthorized` - No valid session
- `404 Not Found` - No recovery key available (NIP-07 users manage their own keys)
- `429 Too Many Requests` - Rate limit exceeded (includes `Retry-After` header)
- `500 Internal Server Error` - Failed to decrypt or fetch key

**Notes**:
- Only available to users with ephemeral keys (anonymous, email, GitHub accounts)
- NIP-07 users will receive a 404 since they manage their own keys externally
- Used by profile UI for displaying/copying recovery key
- Used by client-side signing code (zaps, reactions) when `session.user.hasEphemeralKeys` is true
- Key is never stored in JWT/session; always fetched on-demand

### GET /api/account/linked

Returns all linked accounts for the current user.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "accounts": [
    { "provider": "github", "isPrimary": true,  "createdAt": "2025-01-01T00:00:00.000Z" },
    { "provider": "nostr",  "isPrimary": false, "createdAt": "2025-01-01T00:00:00.000Z" }
  ],
  "primaryProvider": "github",
  "profileSource": "oauth"
}
```

Notes:
- Provider identifiers are not included here. For `providerAccountId` values, see `/api/profile/aggregated`.
- `createdAt` is the timestamp when the provider was linked.
- The `profileSource` field may be `null` only if an account has not yet established provider preferences; the UI derives behavior from `primaryProvider`.

### POST /api/account/link

Links a new account to the current user.

**Authentication**: Required

**Request Body**:
```json
{
  "provider": "nostr",
  "providerAccountId": "02a1..."
}
```

Notes:
- `provider` accepts `nostr`, `email`, `github`, or `anonymous` (UI only exposes `nostr`, `email`, `github`).
- Nostr account IDs must be 64-char hex pubkeys (nsec/npub are rejected here).

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Successfully linked nostr account"
}
```

**Error Responses**:
- `400 Bad Request` - Invalid provider/missing data or account already linked
- `401 Unauthorized` - No valid session

Linking a Nostr account additionally:
- Normalises the pubkey, replaces `User.pubkey`, and clears any stored `privkey`.
- Sets `primaryProvider = 'nostr'` and `profileSource = 'nostr'`.
- Triggers a best-effort Nostr profile sync so name/avatar/nip05/lud16/banner update when relays are reachable.

### POST /api/account/unlink

Unlinks an account from the current user.

**Authentication**: Required

**Request Body**:
```json
{
  "provider": "github"
}
```

Notes:
- `provider` accepts `nostr`, `email`, `github`, `anonymous`, `recovery`.

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "GitHub account unlinked successfully"
}
```

**Error Responses**:
- `400 Bad Request` - Cannot unlink your last authentication method or account not found
- `401 Unauthorized` - No valid session

## Account Preferences APIs

### GET /api/account/preferences

Fetches user's account preferences.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "profileSource": "oauth",
  "primaryProvider": "github"
}
```

Notes:
- If unset, `primaryProvider` falls back to `session.provider` (or `email`).

### POST /api/account/preferences

Updates user's account preferences.

**Authentication**: Required

**Request Body**:
```json
{
  "profileSource": "nostr",
  "primaryProvider": "nostr"
}
```

Notes:
- `primaryProvider` may be set to `"current"` to keep the existing provider while changing `profileSource`.

**Response**: `200 OK`
```json
{
  "success": true,
  "profileSource": "nostr",
  "primaryProvider": "nostr"
}
```

**Error Responses**:
- `400 Bad Request` - Provider not linked to account
- `401 Unauthorized` - No valid session

### POST /api/account/primary

Changes the user's primary authentication provider.

**Authentication**: Required

**Request Body**:
```json
{ "provider": "nostr" }
```

Notes:
- `provider` accepts `nostr`, `email`, `github`, `anonymous`, `recovery`.

**Response**: `200 OK`
```json
{ "success": true, "message": "Successfully changed primary provider to nostr" }
```

**Error Responses**:
- `400 Bad Request` - Provider not linked to account
- `401 Unauthorized` - No valid session

## Sync APIs

### POST /api/account/sync

Syncs profile data from a specific linked provider (token-aware).

**Authentication**: Required

**Request Body**:
```json
{
  "provider": "github"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Profile synced from github",
  "updated": ["username", "avatar", "banner", "email"]
}
```

**Sync Behavior by Provider**:

#### GitHub Sync
- Fetches latest profile from GitHub API using stored OAuth tokens.
- Attempts token refresh on 401; if refresh fails, returns 401 and clears tokens.
- Updates: username, avatar, banner (from GitHub `bio`), and email when present.

#### Nostr Sync
- Fetches profile from Nostr relays using the linked `providerAccountId` (hex pubkey).
- Updates: username, avatar, banner, nip05, lud16.

#### Email Sync
- Uses the linked email account’s `providerAccountId` as the source of truth.
- If `User.email` is missing or differs, it is updated; otherwise returns “No updates found from provider.”

#### Current Sync
- `provider: "current"` returns success with a no-op message (no updates performed).

**Error Responses**:
- `400 Bad Request` - Provider not linked or unsupported
- `401 Unauthorized` - No valid session
- `500 Internal Server Error` - Sync failed

### POST /api/profile/sync

Profile-aware sync that respects the account's `profileSource` rules.

**Authentication**: Required

**Request Body**:
```json
{
  "provider": "nostr"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Successfully synced full profile from Nostr",
  "profile": {
    "name": "alice",
    "email": "alice@example.com",
    "image": "https://...",
    "nip05": "alice@nostr.example",
    "lud16": "alice@getalby.com",
    "banner": "https://...",
    "provider": "nostr",
    "syncedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

Notes:
- For `nostr`, OAuth-first accounts only update enhanced fields (nip05, lud16, banner); Nostr-first accounts run a full sync.
- For `github`, the current implementation updates `username` from the linked account’s `providerAccountId` (no live GitHub API call).
- For `email`, returns success if an email exists; otherwise returns `400`.

## OAuth Linking APIs

### GET /api/account/link-oauth

Initiates OAuth flow for account linking.

**Authentication**: Required

**Query Parameters**:
- `provider` (required) - OAuth provider (currently "github")

**Example**: `/api/account/link-oauth?provider=github`

**Response**: `302 Redirect`
- Redirects to GitHub OAuth authorization page
- Includes a base64-encoded state parameter validated for size and JSON schema

**OAuth Flow**:
1. User redirected to GitHub
2. User authorizes the application
3. GitHub redirects back to callback URL
4. Account linking completed

### GET /api/account/oauth-callback

Handles OAuth callback and completes account linking.

**Query Parameters**:
- `code` - OAuth authorization code from provider
- `state` - Base64-encoded state JSON (validated)

**Response**: `302 Redirect`
- Success: Redirects to `/profile?tab=accounts&success=github_linked`
- Error: Redirects to `/profile?tab=accounts&error=[error_code]`

**Error Codes**:
- `invalid_state` - State param malformed or failed validation
- `invalid_action` - Unexpected action in state
- `session_mismatch` - User session expired or changed
- `token_exchange_failed` - Failed to get access token
- `user_fetch_failed` - Could not retrieve provider profile
- `linking_failed` - Database operation failed
- String messages from linking (e.g., "This account is already linked to another user")

## Email Linking APIs

### POST /api/account/send-link-verification

Sends verification email for account linking.

**Authentication**: Required

**Request Body**:
```json
{
  "email": "john@example.com"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Verification email sent to john@example.com"
}
```

**Email Contents**:
- Subject: "Verify your email to link your account"
- Contains a link to `/verify-email?ref=...` and a 6-digit code valid for 60 minutes

**Rate Limit**: 3 requests per email address per hour

**Error Responses**:
- `400 Bad Request` - Invalid email format
- `400 Bad Request` - Email already linked
- `401 Unauthorized` - No valid session
- `429 Too Many Requests` - Rate limit exceeded (includes `Retry-After` header)
- `500 Internal Server Error` - Failed to send email

### POST /api/account/verify-email

Completes email linking by verifying a short code (token) with a lookup reference.

**Authentication**: Not required (uses token + ref)

**Request Body**:
```json
{ "ref": "<lookupId>", "token": "123456" }
```

**Rate Limit**: 5 attempts per ref per hour (prevents brute force on 6-digit codes)

**Response**: `200 OK`
```json
{ "success": true }
```

**Error Responses**:
- `400 Bad Request` with `error` set to `invalid_token`, `token_expired`, `token_mismatch`, `invalid_token_format`, or `Invalid request data`
- `429 Too Many Requests` with `error` set to `too_many_attempts` (includes `Retry-After` header)
- `500 Internal Server Error` with `error` set to `verification_error`

### GET /verify-email (Page)

Renders a form to submit the 6-digit code. On success, redirects to `/profile?tab=accounts&success=email_linked`.

## Server Actions

### updateBasicProfile

Updates basic profile fields (name, email) for OAuth-first accounts only.

**Location**: `/src/app/profile/actions.ts`

**Input**:
```typescript
{
  name?: string    // Min: 1, Max: 100 characters
  email?: string   // Valid email format
}
```

**Returns**:
```typescript
{
  success: boolean
  message: string
  updates?: string[]  // Fields that were updated
  errors?: ZodIssue[] // Validation errors if any
}
```

**Restrictions**:
- Only available for OAuth-first accounts
- Nostr-first accounts cannot use this action
- Email must be unique across all users

### updateEnhancedProfile

Updates enhanced profile fields for all account types.

**Location**: `/src/app/profile/actions.ts`

**Input**:
```typescript
{
  nip05?: string   // Nostr address (user@domain.com)
  lud16?: string   // Lightning address  
  banner?: string  // Valid URL for banner image
  signedEvent?: {  // Required for Nostr-first accounts
    id: string
    pubkey: string
    created_at: number
    kind: 0
    tags: string[][]
    content: string
    sig: string
  }
}
```

**Returns**:
```typescript
{
  success: boolean
  message: string
  updates?: string[]     // Fields that were updated
  isNostrFirst?: boolean // Warning about potential override
  publishedToNostr?: boolean
  publishMode?: "server-sign" | "signed-event" | null
  nostrProfile?: Record<string, any> | null
  errors?: ZodIssue[]    // Validation errors if any
}
```

**Notes**:
- Available to all users
- For Nostr-first accounts, a signed kind 0 event is required and published to relays; DB fields may still be overridden by future syncs
- For OAuth-first accounts, DB updates are applied and a best-effort relay publish is attempted
- URL validation for banner field

### updateAccountPreferences

Updates account configuration (profile source, primary provider).

**Location**: `/src/app/profile/actions.ts`

**Input**:
```typescript
{
  profileSource: 'nostr' | 'oauth'
  primaryProvider: string
}
```

**Returns**:
```typescript
{
  success: boolean
  message: string
  updates?: string[]  // Configuration items updated
  errors?: ZodIssue[] // Validation errors if any
}
```

**Validation**:
- Primary provider must be linked to account
- Profile source must be valid enum value

## Error Handling

Most profile/account APIs return JSON error payloads like:

```json
{
  "error": "Descriptive error message",
  "details": {} // Optional additional context
}
```

Notes:
- Some endpoints include `message`, `retryAfter`, or `success` fields in addition to `error`.
- OAuth linking endpoints (`/api/account/link-oauth`, `/api/account/oauth-callback`) redirect and pass error info via query params.

### HTTP Status Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 200 | Success | Operation completed |
| 302 | Redirect | OAuth flow redirects |
| 400 | Bad Request | Invalid input, missing params |
| 401 | Unauthorized | No session, expired session |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, already exists |
| 500 | Internal Error | Server error, external API failure |

### Error Recovery

1. **Session Errors** (401)
   - Redirect to sign-in
   - Store return URL
   - Resume after auth

2. **Validation Errors** (400)
   - Display field-level errors
   - Highlight invalid inputs
   - Show help text

3. **Conflict Errors** (409)
   - Explain conflict
   - Offer resolution options
   - Link to support

4. **Server Errors** (500)
   - Show generic message
   - Log details server-side
   - Offer retry option

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-min-32-chars

# Key encryption (REQUIRED in production)
# ⚠️ WARNING: Without a stable key, encrypted privkeys become unrecoverable after restart.
# In dev, an ephemeral key is auto-generated if unset, but anonymous account keypairs
# will be lost on restart. Use a stable 32-byte key (hex or base64) if you need
# persistent encrypted privkeys. Ephemeral keys are only safe for throwaway/test data.
# Generate with: openssl rand -hex 32
PRIVKEY_ENCRYPTION_KEY=hex-or-base64-32-byte-key
```

### Optional Variables

```env
# GitHub OAuth (for GitHub linking)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Separate GitHub App for linking (optional)
GITHUB_LINK_CLIENT_ID=separate-app-client-id
GITHUB_LINK_CLIENT_SECRET=separate-app-secret

# Email (required only if you enable email linking)
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=user
EMAIL_SERVER_PASSWORD=pass
EMAIL_SERVER_SECURE=false
EMAIL_FROM=noreply@example.com

# CORS (middleware)
ALLOWED_ORIGINS=http://localhost:3000

# Vercel KV (rate limiting + view counters)
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

### Development Variables

```env
# Development only
NODE_ENV=development
```

Note: Nostr **profile fetch** uses the fixed relay list in `src/lib/nostr-profile.ts` (relay.nostr.band, nos.lol, damus). Relay publishing uses `getRelays(...)` from `config/nostr.json`.
