# Prisma v7 Upgrade TODO

**Status**: Pending - do on separate branch
**Priority**: Medium
**Current Version**: 6.19.0
**Target Version**: 7.x

## Breaking Changes to Address

### 1. ESM Migration
- Add `"type": "module"` to package.json
- Update `tsconfig.json`: `"module": "ESNext"`, `"moduleResolution": "bundler"`

### 2. Generator Changes
```prisma
// Old (v6)
generator client {
  provider = "prisma-client-js"
}

// New (v7)
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"
}
```

### 3. Driver Adapter Required
Install and configure `@prisma/adapter-pg`:

```typescript
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
```

### 4. Import Path Updates
All imports change from `@prisma/client` to the new output path.

### 5. Environment Variables
No longer auto-loaded. Ensure dotenv or Next.js env loading happens before Prisma CLI commands.

### 6. SSL Certificates
Now validated by default. May need `ssl: { rejectUnauthorized: false }` for dev.

## Files to Update

- `package.json` - type: module, new deps
- `tsconfig.json` - ESM config
- `prisma/schema.prisma` - new generator
- `src/lib/prisma.ts` - driver adapter setup
- All files importing from `@prisma/client`
- `prisma/seed.ts` - imports
- Docker entrypoint scripts if any

## Migration Steps

1. Create branch `chore/prisma-v7-upgrade`
2. Run `npm i prisma@7 @prisma/client@7 @prisma/adapter-pg`
3. Update schema.prisma generator
4. Run `npx prisma generate`
5. Update PrismaClient instantiation with adapter
6. Fix all import paths
7. Test locally with `npm run dev` and `npm run build`
8. Test Docker setup
9. Run full test suite

## Reference
- https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
