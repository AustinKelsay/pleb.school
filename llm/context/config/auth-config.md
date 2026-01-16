# Auth Configuration

Deep-dive reference for `config/auth.json` - authentication providers, session settings, and sign-in UI configuration.

## File Location

```text
config/auth.json
```

## Accessor Files

| File | Purpose |
|------|---------|
| `src/lib/auth-config-client.ts` | Client-safe subset of auth config |
| `src/lib/auth-icons.ts` | Icon getters for providers/security/account |

## Schema Overview

```json
{
  "icons": { "providers": {}, "security": {}, "account": {} },
  "providers": { "email": {}, "github": {}, "nostr": {}, "anonymous": {}, "recovery": {} },
  "session": {},
  "security": {},
  "pages": {},
  "features": {},
  "copy": {},
  "_comments": {},
  "_examples": {}
}
```

## Icons Configuration

### providers

Icons for each authentication provider button.

| Key | Default | Description |
|-----|---------|-------------|
| `email` | `"Mail"` | Email magic link provider |
| `github` | `"GitHub"` | GitHub OAuth provider |
| `nostr` | `"Zap"` | NIP-07 Nostr extension |
| `anonymous` | `"UserX"` | Anonymous/ephemeral accounts |
| `recovery` | `"KeyRound"` | Private key recovery |

### security

Icons for security-related UI elements.

| Key | Default | Description |
|-----|---------|-------------|
| `shield` | `"Shield"` | General security indicator |
| `shieldCheck` | `"ShieldCheck"` | Verified/secure state |
| `key` | `"Key"` | Key/credential related |
| `sparkles` | `"Sparkles"` | Feature highlight |
| `help` | `"HelpCircle"` | Help/info |
| `arrow` | `"ArrowRight"` | Navigation arrow |
| `chevronDown` | `"ChevronDown"` | Dropdown indicator |

### account

Icons for account management features.

| Key | Default | Description |
|-----|---------|-------------|
| `link` | `"Link2"` | Link account |
| `unlink` | `"Unlink"` | Unlink account |
| `user` | `"User"` | User profile |
| `admin` | `"Crown"` | Admin indicator |
| `loader` | `"Loader2"` | Loading spinner |

## Providers Configuration

### email

```json
{
  "enabled": true,
  "maxAge": 86400
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable email magic link authentication |
| `maxAge` | number | Link expiry in seconds (default: 86400 = 24h) |

**Required Environment Variables:**
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_SERVER_SECURE`
- `EMAIL_FROM`

### GitHub

```json
{
  "enabled": true,
  "autoCreateUser": true,
  "usernamePrefix": "gh_",
  "allowedUsers": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable GitHub OAuth |
| `autoCreateUser` | boolean | Create user on first login |
| `usernamePrefix` | string | Prefix for auto-generated usernames |
| `allowedUsers` | string[] | Restrict to specific GitHub usernames (empty = all) |

**Required Environment Variables:**
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - Sign-in OAuth app
- `GITHUB_LINK_CLIENT_ID` / `GITHUB_LINK_CLIENT_SECRET` - Account linking OAuth app

### nostr

```json
{
  "enabled": true,
  "autoCreateUser": true,
  "usernamePrefix": "nostr_",
  "usernameLength": 8
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable NIP-07 extension authentication |
| `autoCreateUser` | boolean | Create user on first login |
| `usernamePrefix` | string | Prefix for auto-generated usernames |
| `usernameLength` | number | Characters from pubkey for username |

**How it works:** Uses NIP-98 HTTP Auth (kind 27235) for cryptographic pubkey verification.

### anonymous

```json
{
  "enabled": true,
  "autoCreateUser": true,
  "usernamePrefix": "anon_",
  "usernameLength": 8,
  "defaultAvatar": "https://api.dicebear.com/7.x/identicon/svg?seed="
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable anonymous ephemeral accounts |
| `autoCreateUser` | boolean | Auto-create on login |
| `usernamePrefix` | string | Prefix for usernames |
| `usernameLength` | number | Characters from pubkey |
| `defaultAvatar` | string | Avatar URL template (pubkey appended) |

### recovery

```json
{
  "enabled": true,
  "supportedFormats": ["hex", "nsec"],
  "description": "Recover your ephemeral account using your private key"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable private key recovery |
| `supportedFormats` | string[] | Accepted key formats |
| `description` | string | Help text for recovery card |

## Session Configuration

```json
{
  "strategy": "jwt",
  "maxAge": 2592000,
  "updateAge": 86400
}
```

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | `"jwt"` \| `"database"` | Session storage method |
| `maxAge` | number | Max session duration (default: 2592000 = 30 days) |
| `updateAge` | number | Session refresh interval (default: 86400 = 1 day) |

## Security Configuration

```json
{
  "requireEmailVerification": false,
  "allowSignup": true,
  "redirectAfterSignin": "/"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requireEmailVerification` | boolean | Force email verification before access |
| `allowSignup` | boolean | Allow new user registration |
| `redirectAfterSignin` | string | Default redirect URL after login |

## Pages Configuration

```json
{
  "signin": "/auth/signin",
  "verifyRequest": "/auth/verify-request",
  "error": "/auth/error",
  "signout": "/auth/signout"
}
```

Custom URLs for authentication pages. Used by NextAuth.

## Features Configuration

```json
{
  "showEmailProvider": true,
  "showNostrProvider": true,
  "showGithubProvider": true,
  "showAnonymousProvider": true,
  "showRecoveryProvider": true,
  "enableGuestMode": false,
  "requireTermsAcceptance": false,
  "showLayoutSections": true,
  "showInfoCard": true,
  "useColumnLayout": true
}
```

| Field | Description |
|-------|-------------|
| `show*Provider` | Show/hide specific provider in UI |
| `enableGuestMode` | Allow content access without login |
| `requireTermsAcceptance` | Show terms acceptance text |
| `showLayoutSections` | Show section headers in layout |
| `showInfoCard` | Show info card explaining identity models |
| `useColumnLayout` | Two-column layout vs single-column |

## Copy Configuration

All sign-in page text is configurable under `copy`:

- `copy.signin.*` - Sign-in page title, description, provider cards
- `copy.signin.messages.*` - Success/error messages
- `copy.verifyRequest.*` - Email verification page
- `copy.error.*` - Authentication error page

See the actual `auth.json` for the full copy structure.

## Usage Examples

### Check Provider Status

```typescript
import authConfig from '../../config/auth.json'

if (authConfig.providers.nostr.enabled) {
  // Show Nostr login option
}

if (authConfig.features.showAnonymousProvider) {
  // Render anonymous login card
}
```

### Get Provider Icon

```typescript
import { getProviderIcon, getSecurityIcon } from '@/lib/auth-icons'

const NostrIcon = getProviderIcon('nostr')      // Returns Zap icon
const ShieldIcon = getSecurityIcon('shieldCheck') // Returns ShieldCheck icon

// Usage
<NostrIcon className="h-5 w-5" />
```

### Client-Safe Access

```typescript
import { authConfigClient } from '@/lib/auth-config-client'

// Only exposes safe properties:
// - features
// - copy
// - pages
// - providers.anonymous (partial)
// - providers.recovery (partial)
```

## Configuration Recipes

### Nostr-Only Instance

```json
{
  "providers": {
    "email": { "enabled": false },
    "github": { "enabled": false },
    "nostr": { "enabled": true },
    "anonymous": { "enabled": true },
    "recovery": { "enabled": true }
  },
  "features": {
    "showEmailProvider": false,
    "showGithubProvider": false,
    "showNostrProvider": true,
    "showAnonymousProvider": true,
    "showRecoveryProvider": true
  }
}
```

### Private Instance (Restricted Access)

```json
{
  "security": {
    "allowSignup": false,
    "requireEmailVerification": true
  },
  "providers": {
    "github": {
      "enabled": true,
      "allowedUsers": ["allowed-user-1", "allowed-user-2"]
    }
  }
}
```

### Minimal Traditional Auth

```json
{
  "providers": {
    "email": { "enabled": true },
    "github": { "enabled": true },
    "nostr": { "enabled": false },
    "anonymous": { "enabled": false },
    "recovery": { "enabled": false }
  },
  "features": {
    "showEmailProvider": true,
    "showGithubProvider": true,
    "showNostrProvider": false,
    "showAnonymousProvider": false,
    "showRecoveryProvider": false,
    "useColumnLayout": false,
    "showInfoCard": false
  }
}
```

## Related Documentation

- [authentication-system.md](../authentication-system.md) - Auth architecture
- [config-system.md](../config-system.md) - Config system overview
- [github-oauth-setup.md](../../implementation/github-oauth-setup.md) - OAuth setup guide
