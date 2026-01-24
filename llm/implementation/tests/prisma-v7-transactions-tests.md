# prisma-v7-transactions.test.ts

**Location**: `src/lib/tests/prisma-v7-transactions.test.ts`
**Tests**: 12

## Purpose

Integration coverage for Prisma v7 transaction behavior with the pg adapter. Validates isolation levels, rollback semantics, and the interactive transaction pattern used by purchase claiming.

## Requirements

- `DATABASE_URL` must be set.
- Tests are skipped if `DATABASE_URL` is missing or points to Docker hostname `db`.

## Test Suites

### Transaction Isolation Levels

| Test | Scenario | Expected |
|------|----------|----------|
| Serializable | `Prisma.TransactionIsolationLevel.Serializable` | Query succeeds, returns count |
| ReadCommitted | `ReadCommitted` | Query succeeds |
| RepeatableRead | `RepeatableRead` | Query succeeds |

### Transaction Rollback

| Test | Scenario | Expected |
|------|----------|----------|
| Rollback on error | Throw inside tx | Count unchanged after error |
| Serializable rollback | Throw inside serializable tx | Error propagated |

### Nested CRUD Operations

| Test | Scenario | Expected |
|------|----------|----------|
| Multiple reads | Count users/resources/courses | Returns numeric counts |
| `findFirst` | Fetch user/resource | Returns null or valid IDs |
| `findMany` + relations | Courses with lessons | Lessons arrays returned |

### Purchase-Like Transaction Pattern

| Test | Scenario | Expected |
|------|----------|----------|
| Claim pattern | Find user/resource/purchase | Returns status + purchased boolean |
| Timeout options | `timeout` + `maxWait` | Transaction completes |

### Batched Transactions

| Test | Scenario | Expected |
|------|----------|----------|
| Batched queries | `prisma.$transaction([...])` | Returns arrays for each query |
| Isolation on batch | `ReadCommitted` | Returns numeric counts |
