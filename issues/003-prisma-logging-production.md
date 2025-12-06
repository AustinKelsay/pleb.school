# Issue: Prisma logs all SQL in production

- **Location**: `src/lib/prisma.ts` initializes `new PrismaClient({ log: ['query'] })` unconditionally.
- **Impact**: Every SQL statement (including emails, tokens, invoices) is emitted to stdout in prod, adding latency and leaking PII into logs.
- **Risk**: Privacy exposure, larger logs/cost, potential performance hit under load.
- **Recommended fix**:
  1. Make logging environment-aware, e.g. `log: process.env.NODE_ENV === 'development' ? ['query'] : []`.
  2. Optionally keep `'error' | 'warn'` in prod for observability.
  3. Document the logging policy in `README`/ops runbook and ensure log scrubbers don’t rely on SQL dumps.

