# Prisma Migration Drift

**Status:** Needs reconciliation before production deployment

## Issue

The database schema has drifted from the Prisma migration history. Schema changes were applied via `prisma db push` instead of migrations, causing `prisma migrate dev` to detect drift and require a reset.

## Affected Changes

Changes applied via `db push` that need migration reconciliation:

| Field/Index | Table | Type | Notes |
|-------------|-------|------|-------|
| `anonReconnectTokenHash` | User | `String? @unique` | Secure reconnect token for anonymous accounts |
| Various indexes | Account, Course, Lesson, etc. | `@@index` | Performance indexes on foreign keys |
| `duration` | Draft | column | Draft duration field |

## Why This Happened

During development, `prisma db push` was used to iterate quickly on schema changes. This syncs the DB directly but doesn't create migration files, causing the migration history to fall behind.

## Resolution Options

### Option 1: Baseline Migration (Recommended for existing data)

Create a migration that matches current DB state without changing anything:

```bash
# Generate SQL diff between migrations and current DB
MIGRATION_DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_baseline"
mkdir -p "$MIGRATION_DIR"
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > "$MIGRATION_DIR/migration.sql"

# Mark as applied without running
npx prisma migrate resolve --applied <migration_name>
```

### Option 2: Reset and Migrate (Dev environments only)

```bash
# WARNING: Loses all data
npx prisma migrate reset
npx prisma migrate dev
```

### Option 3: Shadow Database Reconciliation

```bash
# Create migration matching current state
npx prisma migrate dev --create-only --name reconcile_drift

# Review generated SQL, then apply
npx prisma migrate deploy
```

## Before Production

1. Choose a resolution option above
2. Test migration on staging with production data copy
3. Commit migration files to `prisma/migrations/`
4. Run `npx prisma migrate deploy` in production CI/CD

## References

- [Prisma Migration Troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting)
- [Baselining a Database](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)
