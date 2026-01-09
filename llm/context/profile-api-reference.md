# Profile System API Reference

## Table of Contents
- [Profile APIs](#profile-apis)
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
    "value": "npub1...",
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
      "isPrimary": true
    },
    {
      "provider": "nostr",
      "providerAccountId": "npub1...",
      "data": {
        "name": "John Doe",
        "about": "Bitcoin developer",
        "website": "https://johndoe.com",
        "nip05": "john@nostr.example",
        "lud16": "john@getalby.com",
        "pubkey": "npub1..."
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

## Account Management APIs

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

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Successfully linked nostr account"
}
```

**Error Responses**:
- `400 Bad Request` - Invalid provider or missing data
- `409 Conflict` - Account already linked to another user
- `401 Unauthorized` - No valid session

Linking a Nostr account additionally:
- Normalises the pubkey, replaces `User.pubkey`, and clears any stored `privkey`.
- Sets `primaryProvider = 'nostr'` and `profileSource = 'nostr'`.
- Triggers a Nostr profile sync so name/avatar/nip05/lud16/banner update immediately.

### POST /api/account/unlink

Unlinks an account from the current user.

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

**Response**: `200 OK`
```json
{ "success": true, "message": "Successfully changed primary provider to nostr" }
```

**Error Responses**:
- `400 Bad Request` - Provider not linked to account
- `401 Unauthorized` - No valid session

## Sync APIs

### POST /api/account/sync

Syncs profile data from a specific provider.

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
  "updated": ["username", "avatar", "email", "location", "company"]
}
```

**Sync Behavior by Provider**:

#### GitHub Sync
- Fetches latest profile from GitHub API
- Updates: username, email, avatar, location, company
- Requires valid access_token

#### Nostr Sync
- Fetches profile from Nostr relays
- Updates: username, avatar, banner, nip05, lud16, about
- Uses relay pool for redundancy

#### Email Sync
- No external sync (email is static)
- Returns success with no updates

**Error Responses**:
- `400 Bad Request` - Provider not linked or unsupported
- `401 Unauthorized` - No valid session
- `500 Internal Server Error` - Sync failed

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
- `409 Conflict` - Email already linked
- `401 Unauthorized` - No valid session
- `429 Too Many Requests` - Rate limit exceeded (includes `Retry-After` header)
- `500 Internal Server Error` - Failed to send email

### POST /api/account/verify-email

Completes email linking by verifying a short code (token) with a lookup reference.

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
- `400 Bad Request` with `error` set to `invalid_token`, `token_expired`, `token_mismatch`, or `invalid_token_format`
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
}
```

**Returns**:
```typescript
{
  success: boolean
  message: string
  updates?: string[]     // Fields that were updated
  isNostrFirst?: boolean // Warning about potential override
  errors?: ZodIssue[]    // Validation errors if any
}
```

**Notes**:
- Available to all users
- For Nostr-first accounts, may be overridden by next sync
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

All APIs return structured error responses following this format:

```json
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional context
}
```

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

# Email (for verification via Nodemailer)
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=user
EMAIL_SERVER_PASSWORD=pass
EMAIL_SERVER_SECURE=false
EMAIL_FROM=noreply@example.com
```

### Optional Variables

```env
# GitHub OAuth (for GitHub linking)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Separate GitHub App for linking (optional)
GITHUB_LINK_CLIENT_ID=separate-app-client-id
GITHUB_LINK_CLIENT_SECRET=separate-app-secret

# CORS (middleware)
ALLOWED_ORIGINS=http://localhost:3000

# Cache Configuration
CACHE_TTL=300000  # 5 minutes in ms
CACHE_MAX_SIZE=1000
```

### Development Variables

```env
# Development only
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
```

Note: Nostr relays used for profile sync are defined in code (relay.nostr.band, nos.lol, relay.damus.io).
