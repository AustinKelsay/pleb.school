export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { kv } from "@vercel/kv"
import { ViewCounterAdapter } from "@/lib/db-adapter"

type ParsedKey = { key: string; namespace: string; entityId?: string | null; path?: string | null }
let hasLoggedMissingCronSecret = false

const DEFAULT_STALE_AFTER_MINUTES = 60
const MIN_STALE_AFTER_MINUTES = 5
const MAX_STALE_AFTER_MINUTES = 10080

const TELEMETRY_KEYS = {
  lastAttemptAt: "views:flush:meta:last_attempt_at",
  lastSuccessAt: "views:flush:meta:last_success_at",
  lastFailureAt: "views:flush:meta:last_failure_at",
  lastFailureError: "views:flush:meta:last_failure_error",
  consecutiveFailures: "views:flush:meta:consecutive_failures",
  lastDurationMs: "views:flush:meta:last_duration_ms",
  lastFlushedTotals: "views:flush:meta:last_flushed_totals",
  lastFlushedDaily: "views:flush:meta:last_flushed_daily",
} as const

function parseTotalKey(key: string): ParsedKey | null {
  // formats:
  // - views:content:<id>
  // - views:lesson:<id>
  // - views:path:/content/abc
  if (!key.startsWith("views:")) return null
  const rest = key.slice("views:".length)
  if (rest.startsWith("path:")) {
    return { key, namespace: "path", entityId: null, path: rest.slice("path:".length) || "/" }
  }
  const idx = rest.indexOf(":")
  if (idx === -1) return null
  const ns = rest.slice(0, idx)
  const id = rest.slice(idx + 1)
  return { key, namespace: ns, entityId: id || null, path: null }
}

function parseDailyKey(dayKey: string): { dayISO: string; inner: ParsedKey } | null {
  // format: views:daily:YYYY-MM-DD:views:content:<id>
  if (!dayKey.startsWith("views:daily:")) return null
  const afterDaily = dayKey.slice("views:daily:".length)
  const day = afterDaily.slice(0, 10)
  const inner = afterDaily.slice(11)
  const parsed = parseTotalKey(inner)
  if (!parsed) return null
  return { dayISO: day, inner: parsed }
}

function resolveStaleAfterMinutes(rawEnv: NodeJS.ProcessEnv = process.env): number {
  const raw = rawEnv.VIEWS_FLUSH_STALE_AFTER_MINUTES?.trim()
  if (!raw) {
    return DEFAULT_STALE_AFTER_MINUTES
  }

  const parsed = Number.parseInt(raw, 10)
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_STALE_AFTER_MINUTES ||
    parsed > MAX_STALE_AFTER_MINUTES
  ) {
    return DEFAULT_STALE_AFTER_MINUTES
  }

  return parsed
}

function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function sanitizeErrorForTelemetry(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

async function recordFlushSuccess(params: {
  nowIso: string
  flushedTotals: number
  flushedDaily: number
  durationMs: number
}) {
  try {
    await Promise.all([
      kv.set(TELEMETRY_KEYS.lastAttemptAt, params.nowIso),
      kv.set(TELEMETRY_KEYS.lastSuccessAt, params.nowIso),
      kv.set(TELEMETRY_KEYS.lastFailureAt, ""),
      kv.set(TELEMETRY_KEYS.lastFailureError, ""),
      kv.set(TELEMETRY_KEYS.consecutiveFailures, 0),
      kv.set(TELEMETRY_KEYS.lastDurationMs, params.durationMs),
      kv.set(TELEMETRY_KEYS.lastFlushedTotals, params.flushedTotals),
      kv.set(TELEMETRY_KEYS.lastFlushedDaily, params.flushedDaily),
    ])
  } catch (telemetryError) {
    console.error("Failed to persist views flush success telemetry:", telemetryError)
  }
}

async function recordFlushFailure(params: { nowIso: string; error: unknown }) {
  try {
    await kv.incr(TELEMETRY_KEYS.consecutiveFailures)
    await Promise.all([
      kv.set(TELEMETRY_KEYS.lastAttemptAt, params.nowIso),
      kv.set(TELEMETRY_KEYS.lastFailureAt, params.nowIso),
      kv.set(TELEMETRY_KEYS.lastFailureError, sanitizeErrorForTelemetry(params.error)),
    ])
  } catch (telemetryError) {
    console.error("Failed to persist views flush failure telemetry:", telemetryError)
  }
}

async function getFlushStatus(now: Date = new Date()) {
  const staleAfterMinutes = resolveStaleAfterMinutes(process.env)
  const [
    lastAttemptAtRaw,
    lastSuccessAtRaw,
    lastFailureAtRaw,
    lastFailureErrorRaw,
    consecutiveFailuresRaw,
    lastDurationMsRaw,
    lastFlushedTotalsRaw,
    lastFlushedDailyRaw,
  ] = await Promise.all([
    kv.get(TELEMETRY_KEYS.lastAttemptAt),
    kv.get(TELEMETRY_KEYS.lastSuccessAt),
    kv.get(TELEMETRY_KEYS.lastFailureAt),
    kv.get(TELEMETRY_KEYS.lastFailureError),
    kv.get(TELEMETRY_KEYS.consecutiveFailures),
    kv.get(TELEMETRY_KEYS.lastDurationMs),
    kv.get(TELEMETRY_KEYS.lastFlushedTotals),
    kv.get(TELEMETRY_KEYS.lastFlushedDaily),
  ])

  const lastAttemptAt = asIsoOrNull(lastAttemptAtRaw)
  const lastSuccessAt = asIsoOrNull(lastSuccessAtRaw)
  const lastFailureAt = asIsoOrNull(lastFailureAtRaw)
  const lastFailureError =
    typeof lastFailureErrorRaw === "string" && lastFailureErrorRaw.trim().length > 0
      ? lastFailureErrorRaw
      : null

  const consecutiveFailures = Math.max(
    0,
    Math.floor(asNumberOrNull(consecutiveFailuresRaw) ?? 0)
  )
  const lastDurationMs = asNumberOrNull(lastDurationMsRaw)
  const lastFlushedTotals = asNumberOrNull(lastFlushedTotalsRaw)
  const lastFlushedDaily = asNumberOrNull(lastFlushedDailyRaw)

  const isStale = (() => {
    if (!lastSuccessAt) {
      return true
    }
    const ageMs = now.getTime() - new Date(lastSuccessAt).getTime()
    return ageMs > staleAfterMinutes * 60 * 1000
  })()

  return {
    lastAttemptAt,
    lastSuccessAt,
    lastFailureAt,
    lastFailureError,
    consecutiveFailures,
    lastDurationMs,
    lastFlushedTotals,
    lastFlushedDaily,
    staleAfterMinutes,
    isStale,
  }
}

async function runFlushWithTelemetry() {
  const startedAt = Date.now()
  const nowIso = new Date(startedAt).toISOString()
  try {
    const flushedTotals = await flushTotals()
    const flushedDaily = await flushDaily()
    const durationMs = Date.now() - startedAt

    await recordFlushSuccess({
      nowIso,
      flushedTotals,
      flushedDaily,
      durationMs,
    })

    return { flushedTotals, flushedDaily }
  } catch (error) {
    await recordFlushFailure({ nowIso, error })
    throw error
  }
}

function wantsStatus(req: NextRequest): boolean {
  const statusFlag = req.nextUrl.searchParams.get("status")?.trim().toLowerCase()
  return statusFlag === "1" || statusFlag === "true"
}

async function flushTotals(): Promise<number> {
  const keys = (await kv.smembers<string[]>("views:dirty")) || []
  if (!keys.length) return 0

  // Atomically get and delete counts to prevent TOCTOU race
  // If increments happen after getdel, they create a new counter and re-add to dirty set
  const pairs = await Promise.all(
    keys.map(async (k) => {
      // getdel atomically gets the value and deletes the key
      const val = await kv.getdel<number>(k)
      return [k, val ?? 0] as const
    })
  )

  // Filter out zero counts (key was already flushed or never incremented)
  const nonZeroPairs = pairs.filter(([, count]) => count > 0)

  // Upsert into DB using INCREMENT semantics to handle concurrent flushes
  for (const [k, count] of nonZeroPairs) {
    const parsed = parseTotalKey(k)
    if (!parsed) continue
    await ViewCounterAdapter.upsertTotal({
      key: parsed.key,
      namespace: parsed.namespace,
      entityId: parsed.entityId ?? null,
      path: parsed.path ?? null,
      total: Number(count),
      increment: Number(count),
    })
  }

  // Remove from dirty set after successful upsert.
  // Race window: A concurrent INCR can re-add a key to "views:dirty" after our GETDEL
  // but before this SREM. In that case, SREM removes the re-added marker, leaving the
  // counter in KV without a dirty flag until the next INCR re-marks it. This is not
  // data loss—just a transient inconsistency resolved on the next increment.
  await kv.srem("views:dirty", ...keys)
  return nonZeroPairs.length
}

async function flushDaily(): Promise<number> {
  const days = (await kv.smembers<string[]>("views:dirty:daily-index")) || []
  let processed = 0
  for (const day of days) {
    const setKey = `views:dirty:daily:${day}`
    const dayKeys = (await kv.smembers<string[]>(setKey)) || []
    if (!dayKeys.length) {
      // clean the index entry and continue
      await kv.srem("views:dirty:daily-index", day)
      continue
    }

    // Atomically get and delete counts to prevent TOCTOU race
    const pairs = await Promise.all(
      dayKeys.map(async (k) => {
        const val = await kv.getdel<number>(k)
        return [k, val ?? 0] as const
      })
    )

    // Filter out zero counts
    const nonZeroPairs = pairs.filter(([, count]) => count > 0)

    for (const [dk, count] of nonZeroPairs) {
      const parsed = parseDailyKey(dk)
      if (!parsed) continue
      const dayDate = new Date(`${parsed.dayISO}T00:00:00.000Z`)
      await ViewCounterAdapter.upsertDaily({
        key: parsed.inner.key,
        day: dayDate,
        count: Number(count),
        increment: Number(count),
      })
    }

    // Race window: A concurrent INCR can re-add a key to the daily dirty set after our
    // GETDEL but before this SREM. This is not data loss—the counter remains in KV and
    // will be re-marked dirty on the next INCR, then flushed in a subsequent run.
    await kv.srem(setKey, ...dayKeys)
    await kv.srem("views:dirty:daily-index", day)
    processed += nonZeroPairs.length
  }
  return processed
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(/\s+/, 2)
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null
  }

  const normalized = token.trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * Constant-time token comparison. Hashes both inputs to fixed-size digests
 * to avoid leaking length information via timing; compares digests with
 * crypto.timingSafeEqual.
 */
function tokenEquals(expected: string, provided: string): boolean {
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest()
  const providedHash = crypto.createHash("sha256").update(provided, "utf8").digest()
  return crypto.timingSafeEqual(expectedHash, providedHash)
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.VIEWS_CRON_SECRET?.trim()
  const isProduction = process.env.NODE_ENV === "production"

  if (!expected) {
    if (isProduction && !hasLoggedMissingCronSecret) {
      console.error("VIEWS_CRON_SECRET is required in production for /api/views/flush authorization.")
      hasLoggedMissingCronSecret = true
    }
    return false
  }

  const bearerToken = extractBearerToken(req)

  // Backward-compatible query token support for local/manual testing only.
  const queryToken = !isProduction
    ? req.nextUrl.searchParams.get("token")?.trim() ?? null
    : null

  const provided = bearerToken || queryToken
  if (!provided) {
    return false
  }

  return tokenEquals(expected, provided)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (wantsStatus(req)) {
    try {
      const status = await getFlushStatus()
      return NextResponse.json(status)
    } catch (error) {
      console.error("Failed to read views flush status:", error)
      return NextResponse.json({ error: "Failed to read flush status" }, { status: 500 })
    }
  }

  try {
    const result = await runFlushWithTelemetry()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Views flush failed:", error)
    return NextResponse.json({ error: "Failed to flush view counters" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (wantsStatus(req)) {
    try {
      const status = await getFlushStatus()
      return NextResponse.json(status)
    } catch (error) {
      console.error("Failed to read views flush status:", error)
      return NextResponse.json({ error: "Failed to read flush status" }, { status: 500 })
    }
  }

  try {
    const result = await runFlushWithTelemetry()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Views flush failed:", error)
    return NextResponse.json({ error: "Failed to flush view counters" }, { status: 500 })
  }
}
