# Production Readiness Gap Report

Assessment date: 2026-02-24  
Repository: `pleb.school`  
Commit assessed: `b6d95dc`

## Purpose

This document captures what is still missing before production launch, with concrete risks, code evidence, and implementation-ready remediation plans.

This report is focused on the six identified gaps:

1. Missing fail-fast environment validation for production-critical variables.
2. Fragile email authentication runtime configuration.
3. Missing audit-log retention and anonymization pipeline.
4. Missing legacy auth data migration script (if legacy users exist).
5. Potential mismatch between views cron scheduling and authorization setup.
6. Missing operational runbooks for backup/restore, alerting, and incident response.

## Current Release Health Snapshot

Local quality and build gate status is healthy:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed.
- `npm run ci:gate` passed end-to-end.

Implication: the current codebase is stable from a compile/test perspective, but operational and production-hardening gaps remain.

## Finding 1: Missing Fail-Fast Production Env Validation

**Status: Resolved (this PR)**

Severity: High  
Type: Availability and configuration safety

### Why this matters

In production, missing or malformed environment variables should fail immediately at startup. If they do not, failures happen later at runtime (during auth, API calls, cron calls, profile sync, etc.), creating partial outages and harder incident response.

Fail-fast behavior is especially important for:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `PRIVKEY_ENCRYPTION_KEY`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `VIEWS_CRON_SECRET`
- `ALLOWED_ORIGINS` (when cross-origin traffic is expected)

### Evidence in code

- **Resolved:** `src/lib/env.ts` now enforces `PRODUCTION_REQUIRED_VARS` at startup and throws on missing/invalid values; `src/lib/prisma.ts` removed placeholder fallback and relies on `getEnv()` for production safety.
- Production routes and auth flows use `getEnv()` and fail fast if config is invalid.

### Failure modes

- Production deploy boots successfully but fails first sign-in due to missing auth URL or secret.
- Production deploy boots successfully but fails DB access under load due to late DB config failure.
- Cron and rate-limited endpoints fail closed after traffic arrives, instead of rejecting deployment.
- OAuth/linking and profile sync routes produce malformed callback URLs or bad redirects.

### Recommended implementation

1. Make `getEnv()` enforce a production-required env contract.
2. Require exact variables in `NODE_ENV=production`:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (absolute URL, and ideally `https`)
   - `NEXTAUTH_SECRET`
   - `PRIVKEY_ENCRYPTION_KEY` (32-byte key in accepted format)
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `VIEWS_CRON_SECRET`
3. Remove placeholder DB fallback in `src/lib/prisma.ts`; throw explicit error if missing in prod.
4. Add one startup check path that runs consistently for app/API processes.
5. Add tests for production env failure cases:
   - Missing each required variable one-by-one.
   - Malformed URL and malformed encryption key.

### Acceptance criteria

- App process exits immediately in production when required env is missing or invalid.
- CI has tests asserting fail-fast behavior.
- No production route relies on optional fallbacks for critical secrets or base URLs.

## Finding 2: Fragile Email Authentication Configuration

**Status: Resolved (this PR)**

Severity: High  
Type: Authentication reliability and security posture

### Why this matters

Email auth is enabled in config, but SMTP settings are not consistently validated at startup in the NextAuth email provider path. This can cause login failures only when users attempt email sign-in.

This is a bad production failure mode:

- Deployment appears healthy.
- Auth breaks at first real user flow.

### Evidence in code

- **Resolved:** `src/lib/email-config.ts` centralizes SMTP validation with `resolveEmailRuntimeConfig()`; auth and send-link-verification both use it with `strict: true` in production, so email auth fails fast if SMTP vars are incomplete.
- Email provider enabled in `config/auth.json`.
- `src/lib/auth.ts` and `src/app/api/account/send-link-verification/route.ts` both use `resolveEmailRuntimeConfig` with unified TLS and transport policy.

### Failure modes

- Email sign-in fails in production due to missing host/user/pass/from.
- TLS mode mismatch causes delivery failures only in specific providers.
- Different email paths behave differently because transport logic is duplicated and not unified.

### Recommended implementation

1. Centralize SMTP config validation in a single module, for example `src/lib/email-config.ts`.
2. Enforce required SMTP vars when email auth is enabled:
   - `EMAIL_SERVER_HOST`
   - `EMAIL_SERVER_PORT`
   - `EMAIL_SERVER_USER`
   - `EMAIL_SERVER_PASSWORD`
   - `EMAIL_FROM`
3. Normalize and validate `EMAIL_SERVER_SECURE` behavior and TLS policy once, then reuse.
4. Make provider initialization fail-fast if email is enabled but SMTP contract is invalid.
5. Add integration tests for:
   - Enabled email + missing SMTP var => startup failure.
   - Valid SMTP config => provider initializes cleanly.

### Acceptance criteria

- Email auth cannot start in production with incomplete SMTP config.
- All email sending code paths share one validated transport policy.
- No runtime surprises during first-user authentication.

## Finding 3: Missing Audit Log Retention and Anonymization Pipeline

**Status: Resolved (this PR)**

Severity: High  
Type: Compliance, privacy, and data governance

### Why this matters

`AuditLog` records include IP and user-agent metadata (PII). Schema comments explicitly require retention and anonymization policy enforcement, but no cleanup/anonymization job is implemented.

Without this:

- Data can be retained indefinitely.
- Privacy/regulatory exposure grows over time.
- User deletion/anonymization expectations are not operationally guaranteed.

### Evidence in code/docs

- **Resolved:** `src/lib/audit-log-maintenance.ts` implements purge (by retention window) and anonymization; `/api/audit/maintenance` exposes both via bearer auth; `vercel.json` schedules daily cron at 03:27 UTC.
- `prisma/schema.prisma` comments specify retention and anonymization obligations.
- `AUDIT_LOG_RETENTION_DAYS` env var (default 90) controls purge window.

### Failure modes

- Unlimited accumulation of sensitive audit records.
- Inability to prove retention compliance in audit/legal review.
- Incident response burden when ad-hoc purge is required urgently.

### Recommended implementation

1. Decide explicit policy values:
   - Retention period, e.g. 90 days.
   - Anonymization requirements for deleted users.
2. Implement cleanup mechanism:
   - Scheduled API endpoint with internal auth, or
   - DB-native scheduled job, or
   - CI/CD scheduled workflow targeting secure maintenance command.
3. Implement two maintenance tasks:
   - Purge old records past retention window.
   - Anonymize `ip` and `userAgent` for privacy-triggered requests.
4. Add operational logging/metrics for cleanup runs:
   - records scanned
   - records purged
   - records anonymized
   - failures/retries
5. Document policy in repo and privacy docs.

### Acceptance criteria

- Automated retention job exists and runs on schedule.
- User-privacy anonymization path is implemented and testable.
- Policy and implementation are documented and verifiable.

## Finding 4: Missing Legacy Auth Data Migration Script

**Status: Waived (greenfield launch)**

Severity: Medium  
Type: Data correctness and account behavior consistency

### Why this matters

This finding only applies when migrating pre-existing production users.
Current launch scope is greenfield (no legacy production user base), so this migration requirement is waived.

### Evidence in docs

- Product decision: no legacy compatibility/migration paths are required pre-launch.

### Failure modes

- Not applicable for greenfield launch.

### Recommended implementation

1. Keep legacy migration tooling out of the launch-critical path.
2. Re-open this item only if importing legacy user data later.
3. If reopened, implement as a one-off, time-boxed migration utility.

### Acceptance criteria

- Greenfield launch is documented and confirmed to have no legacy user import requirement.

## Finding 5: Views Cron Scheduling vs Authorization Configuration Risk

**Status: In Progress (telemetry + checklist implemented; deployment validation pending)**

Severity: Medium  
Type: Analytics correctness and background job reliability

### Why this matters

View counters rely on periodic flush from KV to Postgres. Cron schedule is present, and flush route is hardened to require bearer auth. Production readiness depends on proving scheduler and secret wiring are actually correct in deployment.

If cron auth is misconfigured, flush can silently fail, causing analytics drift and stale DB counters.

### Evidence in code/config

- Cron schedule exists in `vercel.json` for `/api/views/flush`.
- Flush endpoint requires token authorization via `VIEWS_CRON_SECRET` and fails closed in production.
- Flush endpoint now records telemetry (`lastSuccessAt`, `consecutiveFailures`, `lastFailureError`, counts/duration) and exposes secured status mode via `/api/views/flush?status=1`.
- Repo-native monitor workflow added: `.github/workflows/views-flush-monitor.yml` (5-minute schedule, threshold-based failure conditions, optional Slack webhook).
- Validation checklist added: `llm/implementation/views-flush-validation-checklist.md`.
- Tests verify auth + status/failure telemetry behavior.

### Failure modes

- Cron requests unauthorized (401), no flushes occur.
- KV counts grow but DB totals lag indefinitely.
- Product/admin analytics become misleading over time.

### Recommended implementation

1. Validate deployed cron request auth end-to-end in staging:
   - Confirm bearer header present and matches expected secret.
   - Confirm successful flush response and DB updates.
2. Add monitoring around flush:
   - Last successful flush timestamp.
   - Error count and alert threshold.
3. Add manual runbook command/check:
   - Trigger flush safely.
   - Verify dirty key set drops.
   - Verify DB increments.
4. Decide and standardize secret naming strategy for scheduler compatibility.

### Acceptance criteria

- Staging and production cron runs are observable and authenticated.
- Alert triggers if no successful flush occurs within expected window.
- Analytics lag detection exists.

## Finding 6: Missing Operational Runbooks (Backups, Alerts, Incidents)

Severity: Medium  
Type: Operational resilience

### Why this matters

Engineering readiness is not only code correctness. Production readiness requires explicit procedures for backup/restore, incident response, and alert ownership.

Without these, recovery is slower and risk during outages is higher.

### Current gap

Repository documentation is strong on architecture and implementation, but there is no concrete operational runbook covering:

- Backup cadence and retention.
- Restore drills and RTO/RPO targets.
- Alert routing and escalation.
- On-call ownership.
- Incident communications and postmortem flow.

### Recommended implementation

1. Add `llm/implementation/production-ops-runbook.md` with:
   - service inventory
   - critical dependencies
   - severity model
   - escalation tree
   - rollback and recovery steps
2. Add backup/restore section:
   - DB snapshot schedule
   - retention policy
   - restore test frequency
   - verification checklist
3. Add alerting section:
   - auth failure spikes
   - DB connection failures
   - cron flush failures
   - 5xx error rates
4. Add incident checklist:
   - triage
   - customer impact classification
   - mitigation
   - post-incident review template

### Acceptance criteria

- Runbook exists, is reviewed, and is tested via at least one tabletop drill.
- Backup restore test completed and timestamped.
- Alert ownership and escalation mapping documented.

## Suggested Priority Order

Execute in this order:

1. Fail-fast env validation and removal of prod fallbacks.
2. Email auth config hardening and centralization.
3. Audit-log retention/anonymization job.
4. Views cron auth/wiring verification with monitoring.
5. Operational runbooks and drill validation.

## Suggested Go/No-Go Criteria

Do not call production-ready until all conditions are true:

- Required production env variables are enforced at startup.
- Email auth path is validated and deterministic.
- Audit-log retention automation is live.
- Views flush cron is authenticated and observable.
- Legacy migration is explicitly waived for greenfield launch scope.
- Backup/restore and incident runbooks are written and exercised.

## Implementation Checklist

Resolved items (Findings 1–3) are marked below; each has a **Status: Resolved (this PR)** header in its section.

- [x] Add strict production env contract in `src/lib/env.ts`. *(Finding 1)*
- [x] Remove placeholder DB URL fallback in `src/lib/prisma.ts`. *(Finding 1)*
- [x] Centralize and validate SMTP config for all email paths. *(Finding 2)*
- [x] Add audit-log purge/anonymization job and schedule. *(Finding 3)*
- [ ] Validate cron bearer auth flow in staging and production.
- [x] Add flush telemetry/status endpoint and validation checklist. *(Finding 5, code complete)*
- [x] Draft repo-native alerting workflow config for flush staleness/failure thresholds. *(Finding 5, implementation)*
- [ ] Configure monitor secrets/vars and validate alert delivery in staging/production. *(Finding 5, operational)*
- [x] Waive legacy auth migration for greenfield launch scope. *(Finding 4)*
- [ ] Add and review production operations runbook.
- [ ] Run a pre-launch tabletop drill for failure scenarios.

## Notes

- This report does not indicate build instability; local quality gates pass.
- These are production hardening and operations gaps that can still cause outages or compliance risk if unaddressed.
