# Views Flush Validation Checklist

Author: Codex  
Last Updated: 2026-02-24  
Status: Active

## Scope

Validate `GET /api/views/flush` cron execution and observability in staging/production.

## Preconditions

1. `VIEWS_CRON_SECRET` is set in the target environment.
2. Scheduler is configured to call `/api/views/flush`.
3. Optional: `VIEWS_FLUSH_STALE_AFTER_MINUTES` set to desired threshold (default `60`).

## GitHub Actions Alert Config (Repo-Native)

Implemented workflow:

- `.github/workflows/views-flush-monitor.yml`

Schedule:

- every 5 minutes (`*/5 * * * *`)
- also supports manual run (`workflow_dispatch`)

Configure these repository settings:

Repository variables:
1. `VIEWS_FLUSH_MONITOR_ENABLED`  
   Set to `true` to enable monitoring on this repo (recommended for production).  
   Omit or set anything else to leave the workflow disabled (useful for forks).

   Defaults: `false`

1. `VIEWS_STATUS_BASE_URL`  
   Example: `https://your-production-host`
   Required only when `VIEWS_FLUSH_MONITOR_ENABLED=true`.
2. `VIEWS_FLUSH_ALERT_FAILURE_THRESHOLD`  
   Recommended: `3`
   Optional; workflow defaults to `3` if unset.

Repository secrets:
1. `VIEWS_CRON_SECRET`  
   Must match runtime env secret used by `/api/views/flush`.
2. `SLACK_WEBHOOK_URL` (optional)  
   If set, workflow posts a failure summary to Slack.

Trigger condition in workflow:

- Fail + alert when:
  - `isStale == true`, or
  - `consecutiveFailures >= VIEWS_FLUSH_ALERT_FAILURE_THRESHOLD`

## Auth + Flush Sanity Check

Run with a valid bearer token:

```bash
curl -sS \
  -H "Authorization: Bearer $VIEWS_CRON_SECRET" \
  "https://<host>/api/views/flush"
```

Expected:
- HTTP `200`
- JSON payload like:
  - `flushedTotals`
  - `flushedDaily`

Run with an invalid token:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer invalid" \
  "https://<host>/api/views/flush"
```

Expected:
- HTTP `401`

## Status Endpoint Check

Read status telemetry:

```bash
curl -sS \
  -H "Authorization: Bearer $VIEWS_CRON_SECRET" \
  "https://<host>/api/views/flush?status=1"
```

Expected fields:
- `lastAttemptAt`
- `lastSuccessAt`
- `lastFailureAt`
- `lastFailureError`
- `consecutiveFailures`
- `lastDurationMs`
- `lastFlushedTotals`
- `lastFlushedDaily`
- `staleAfterMinutes`
- `isStale`

Healthy expectation:
- `isStale = false`
- `consecutiveFailures = 0` (or trends back to 0 after recovery)

## Analytics Integrity Spot Check

1. Generate a few known view increments (`POST /api/views`).
2. Trigger flush.
3. Verify:
   - KV dirty sets reduce for flushed keys.
   - Postgres totals increase by expected deltas.

## Failure Path Check

1. Temporarily break flush dependency in staging (for example invalid KV credentials).
2. Trigger flush.
3. Confirm:
   - endpoint returns `500`
   - `consecutiveFailures` increments
   - `lastFailureAt`/`lastFailureError` populated
4. Restore dependency and trigger flush again.
5. Confirm:
   - flush returns `200`
   - `consecutiveFailures` resets to `0`
   - `lastSuccessAt` updates

## Alert Wiring (Next Step)

Minimum alert condition:
- page/notify when `isStale = true` OR `consecutiveFailures >= 3`

Suggested polling cadence:
- every 5 minutes in monitoring platform.
