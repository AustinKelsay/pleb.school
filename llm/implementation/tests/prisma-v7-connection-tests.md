# prisma-v7-connection.test.ts

**Location**: `src/lib/tests/prisma-v7-connection.test.ts`
**Tests**: 13

## Purpose

Integration coverage for the Prisma v7 pg adapter setup. Verifies that the adapter can connect, execute raw queries, run basic CRUD, handle transactions, and disconnect cleanly.

## Requirements

- `DATABASE_URL` must be set.
- Tests are skipped if `DATABASE_URL` is missing or points to Docker hostname `db`.

## Test Suites

### Pool Connection

| Test | Scenario | Expected |
|------|----------|----------|
| Pool connect | Direct `pg` query | `SELECT 1` returns `connected = 1` |
| Pool config | Pool exists | Pool initialized with non-negative totalCount |

### Raw Queries

| Test | Scenario | Expected |
|------|----------|----------|
| `$queryRaw` | Simple query | Returns PostgreSQL version string |
| `$queryRaw` params | Interpolated value | Returned value matches input |
| `$queryRaw` rows | Multi-row query | Generates 3 rows (1..3) |

### Basic CRUD Operations

| Test | Scenario | Expected |
|------|----------|----------|
| `findFirst` | Query users | Returns `null` or `id` string |
| `count` | Users count | Non-negative number |
| `findMany` limit | Users | Up to 5 rows |
| `findMany` order | Resources ordered by `createdAt` | Descending order when multiple rows exist |
| `findMany` where | Free resources | All returned rows have `price = 0` |

### Transaction Support

| Test | Scenario | Expected |
|------|----------|----------|
| Interactive tx | `tx.user.count()` | Returns numeric count |
| Batched tx | `prisma.$transaction([...])` | Returns two counts |

### Disconnection

| Test | Scenario | Expected |
|------|----------|----------|
| `$disconnect` | New client instance | Disconnect completes without error |
