# Admin Configuration

Deep-dive reference for `config/admin.json` - admin/moderator pubkeys and permission management.

## File Location

```
config/admin.json
```

## Accessor File

```
src/lib/admin-utils.ts
```

## Schema Overview

```json
{
  "admins": {
    "pubkeys": [],
    "permissions": {}
  },
  "moderators": {
    "pubkeys": [],
    "permissions": {}
  },
  "features": {},
  "_comments": {},
  "_examples": {}
}
```

## Pubkey Configuration

### admins.pubkeys

Array of Nostr public keys with full admin privileges:

```json
{
  "admins": {
    "pubkeys": [
      "npub17v7g49shev2lwp0uwrx5v88ad6hj970zfse74wkes9jguhkx7aqsgjwsvj",
      "npub1vfs098a8tjg64g5j7zpwt6rmgwxj4d8al9408xzk0vqcqthzln2qdge2se"
    ]
  }
}
```

**Supported formats:**
- `npub1...` - Bech32-encoded public key
- `f33c8a96...` - 64-character hex public key

Both formats are compared during admin checks.

### moderators.pubkeys

Array of Nostr public keys with limited moderation privileges:

```json
{
  "moderators": {
    "pubkeys": [
      "npub3example..."
    ]
  }
}
```

## Permissions

### Admin Permissions

All permissions typically `true` for admins:

```json
{
  "permissions": {
    "createCourse": true,
    "editAnyCourse": true,
    "editOwnCourse": true,
    "deleteCourse": true,
    "createResource": true,
    "editAnyResource": true,
    "editOwnResource": true,
    "deleteResource": true,
    "manageUsers": true,
    "viewOwnAnalytics": true,
    "viewPlatformAnalytics": true,
    "moderateContent": true,
    "manageNostrEvents": true
  }
}
```

### Moderator Permissions

Typically limited to content creation and moderation:

```json
{
  "permissions": {
    "createCourse": true,
    "editOwnCourse": true,
    "deleteCourse": false,
    "createResource": true,
    "editOwnResource": true,
    "deleteResource": false,
    "manageUsers": false,
    "viewOwnAnalytics": true,
    "viewPlatformAnalytics": false,
    "moderateContent": true,
    "manageNostrEvents": false
  }
}
```

### Permission Descriptions

| Permission | Description |
|------------|-------------|
| `createCourse` | Create new courses |
| `editAnyCourse` | Edit any course (not just own) |
| `editOwnCourse` | Edit courses created by user |
| `deleteCourse` | Delete courses |
| `createResource` | Create resources (docs/videos) |
| `editAnyResource` | Edit any resource |
| `editOwnResource` | Edit own resources |
| `deleteResource` | Delete resources |
| `manageUsers` | Manage user accounts |
| `viewOwnAnalytics` | View analytics for own content |
| `viewPlatformAnalytics` | View all platform analytics |
| `moderateContent` | Moderate user content |
| `manageNostrEvents` | Manage Nostr event publishing |

## Features (Advisory)

```json
{
  "features": {
    "requireAdminApproval": false,
    "enableAdminDashboard": true,
    "showAdminBadge": true,
    "adminContactEmail": "admin@example.com"
  }
}
```

| Feature | Description |
|---------|-------------|
| `requireAdminApproval` | Queue content for approval (not wired) |
| `enableAdminDashboard` | Enable admin dashboard route |
| `showAdminBadge` | Display admin/mod badges (wired) |
| `adminContactEmail` | Contact email for admin notices |

**Note:** Most features are advisory. `showAdminBadge` is wired to `AdminBadge` component.

## Admin Detection

The system uses dual detection methods:

### 1. Database Role

Checks `Role.admin` field in database:

```typescript
const userRole = await prisma.role.findUnique({
  where: { userId },
  select: { admin: true }
})
```

### 2. Config Pubkeys

Compares session pubkey against config:

```typescript
const isAdmin = adminConfig.admins.pubkeys.some(adminKey =>
  adminKey === normalized.hex || adminKey === normalized.npub
)
```

### Detection Priority

1. Check database Role.admin first
2. If not admin in DB, check config pubkeys
3. Return appropriate level and permissions

## Usage Examples

### Check Admin Status

```typescript
import { isAdmin, isModerator, hasModeratorOrAdmin } from '@/lib/admin-utils'

// Simple boolean checks
const userIsAdmin = await isAdmin(session)
const userIsMod = await isModerator(session)
const hasAccess = await hasModeratorOrAdmin(session)
```

### Get Full Admin Info

```typescript
import { getAdminInfo } from '@/lib/admin-utils'

const info = await getAdminInfo(session)
// Returns:
// {
//   isAdmin: boolean,
//   isModerator: boolean,
//   level: 'none' | 'moderator' | 'admin',
//   permissions: AdminPermissions,
//   source: 'database' | 'config' | 'none'
// }

if (info.isAdmin && info.source === 'config') {
  // Admin via config pubkey
}
```

### Check Specific Permission

```typescript
import { hasPermission } from '@/lib/admin-utils'

const canCreate = await hasPermission(session, 'createCourse')
const canViewAll = await hasPermission(session, 'viewPlatformAnalytics')
```

### Client-Side Checks

For components that have session data:

```typescript
import { isAdminBySession, isModeratorBySession } from '@/lib/admin-utils'

function AdminButton({ session }) {
  const isAdmin = isAdminBySession(session)

  if (!isAdmin) return null
  return <Button>Admin Action</Button>
}
```

### Get Config Directly

```typescript
import { adminConfig, getAdminConfig } from '@/lib/admin-utils'

const config = getAdminConfig()
const adminPubkeys = config.admins.pubkeys
```

## TypeScript Types

```typescript
import type {
  AdminPermissions,
  AdminLevel,
  AdminInfo
} from '@/lib/admin-utils'

// AdminLevel: 'none' | 'moderator' | 'admin'

// AdminInfo structure
interface AdminInfo {
  isAdmin: boolean
  isModerator: boolean
  level: AdminLevel
  permissions: AdminPermissions
  source: 'database' | 'config' | 'none'
}
```

## Configuration Recipes

### Single Admin

```json
{
  "admins": {
    "pubkeys": ["npub1youradminkey..."],
    "permissions": {
      "createCourse": true,
      "editAnyCourse": true,
      "deleteCourse": true,
      "createResource": true,
      "editAnyResource": true,
      "deleteResource": true,
      "manageUsers": true,
      "viewOwnAnalytics": true,
      "viewPlatformAnalytics": true,
      "moderateContent": true,
      "manageNostrEvents": true
    }
  },
  "moderators": {
    "pubkeys": [],
    "permissions": {}
  }
}
```

### Multi-Tier System

```json
{
  "admins": {
    "pubkeys": ["npub1superadmin..."],
    "permissions": { ... }
  },
  "moderators": {
    "pubkeys": ["npub1mod1...", "npub1mod2...", "npub1mod3..."],
    "permissions": {
      "createCourse": true,
      "editOwnCourse": true,
      "deleteCourse": false,
      "createResource": true,
      "editOwnResource": true,
      "deleteResource": false,
      "manageUsers": false,
      "viewOwnAnalytics": true,
      "viewPlatformAnalytics": false,
      "moderateContent": true,
      "manageNostrEvents": false
    }
  }
}
```

### Read-Only Moderators

```json
{
  "moderators": {
    "pubkeys": ["npub1readonly..."],
    "permissions": {
      "createCourse": false,
      "editOwnCourse": false,
      "deleteCourse": false,
      "createResource": false,
      "editOwnResource": false,
      "deleteResource": false,
      "manageUsers": false,
      "viewOwnAnalytics": true,
      "viewPlatformAnalytics": true,
      "moderateContent": true,
      "manageNostrEvents": false
    }
  }
}
```

## Search Integration

Admin pubkeys are used to filter search results. Only content authored by admins and moderators appears in search:

```typescript
// From useNostrSearch.ts
function getAuthorizedSearchAuthors(): string[] {
  const { admins, moderators } = adminConfig as AdminPubkeyConfig
  const configuredPubkeys = [
    ...(admins?.pubkeys ?? []),
    ...(moderators?.pubkeys ?? [])
  ]

  const normalized = configuredPubkeys
    .map(normalizeHexPubkey)
    .filter((pubkey): pubkey is string => Boolean(pubkey))

  const unique = Array.from(new Set(normalized))

  if (unique.length === 0) {
    console.warn('Nostr search disabled: no admin/moderator pubkeys configured')
  }

  return unique
}
```

This ensures search only returns content from authorized platform creators. The function normalizes pubkeys (handles both npub and hex formats), filters out invalid entries, deduplicates the list, and logs a browser console warning if no valid pubkeys are configured.

## Important Notes

1. **Pubkey Format**: Both npub and hex formats work - the system normalizes and compares both.

2. **Database Takes Priority**: If a user is admin via database Role, they get admin permissions regardless of config.

3. **Moderators Not in DB**: The database Role model doesn't have a moderator field, so moderators are config-only.

4. **Empty Pubkeys = No Search**: If `admins.pubkeys` and `moderators.pubkeys` are both empty, Nostr search will return no results. The system logs a browser console warning: `"Nostr search disabled: no admin/moderator pubkeys configured"` when this condition is detected.

5. **Empty Pubkeys Are Allowed**: Intentionally empty pubkeys are allowed at startup - the application will start normally, but search functionality will be disabled until pubkeys are configured. This allows for development/testing scenarios where search may not be needed.

6. **Recovery in Production**: If pubkeys are accidentally cleared or misconfigured in production:
   - Update `config/admin.json` with the correct pubkey arrays
   - Restart the application (or trigger a config reload if supported)
   - The warning will disappear once valid pubkeys are present
   - No database migration is required - this is a runtime configuration change

7. **Features Are Advisory**: Most feature flags require explicit wiring to enforce.

## Related Documentation

- [config-system.md](../config-system.md) - Config system overview
- [authentication-system.md](../authentication-system.md) - Auth architecture
- [search-system.md](../search-system.md) - Search implementation
