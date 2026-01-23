# prisma-v7-types.test.ts

**Location**: `src/lib/tests/prisma-v7-types.test.ts`
**Tests**: 15

## Purpose

Confirms that Prisma v7 exports are available from the generated client path (`@/generated/prisma`) and that runtime error classes can be imported for `instanceof` checks.

## Test Suites

### PrismaClient + Prisma Namespace

| Test | Scenario | Expected |
|------|----------|----------|
| PrismaClient export | Constructor exists | `PrismaClient` is a function |
| Prisma namespace | Namespace exists | `Prisma` is an object |
| Isolation enum | `TransactionIsolationLevel` present | Enum is defined |
| Serializable | `TransactionIsolationLevel.Serializable` | Equals `"Serializable"` |
| All isolation levels | Full enum set | All values present |

### JSON Types

| Test | Scenario | Expected |
|------|----------|----------|
| JsonArray | Type usable | Accepts mixed JSON values |
| JsonObject | Type usable | Accepts nested objects |
| InputJsonValue | Type usable | Accepts JSON primitives |
| InputJsonArray | Type usable | Accepts arrays |
| InputJsonObject | Type usable | Accepts objects w/ optional values |

### Error Classes

| Test | Scenario | Expected |
|------|----------|----------|
| KnownRequestError export | Runtime class available | Constructor is function |
| instanceof | Create error instance | `instanceof` works |

### Model Types

| Test | Scenario | Expected |
|------|----------|----------|
| CourseInclude | Include type | Type usable in object literal |
| ResourceWhereInput | Where type | Type usable in object literal |
| UserSelect | Select type | Type usable in object literal |
