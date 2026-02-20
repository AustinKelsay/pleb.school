export const runtime = "nodejs"

import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { kv } from "@vercel/kv"
import { prisma } from "@/lib/prisma"

type ParsedKey = { key: string; namespace: string; entityId?: string | null; path?: string | null }
let hasLoggedMissingCronSecret = false

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
    await prisma.viewCounterTotal.upsert({
      where: { key: parsed.key },
      create: {
        key: parsed.key,
        namespace: parsed.namespace,
        entityId: parsed.entityId ?? null,
        path: parsed.path ?? null,
        total: Number(count),
      },
      update: {
        // INCREMENT by the flushed delta, don't SET to absolute value
        total: { increment: Number(count) },
      },
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
      await prisma.viewCounterDaily.upsert({
        where: { key_day: { key: parsed.inner.key, day: dayDate } },
        create: {
          key: parsed.inner.key,
          day: dayDate,
          count: Number(count),
        },
        update: {
          // INCREMENT by the flushed delta, don't SET to absolute value
          count: { increment: Number(count) },
        },
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
  const totals = await flushTotals()
  const daily = await flushDaily()
  return NextResponse.json({ flushedTotals: totals, flushedDaily: daily })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const totals = await flushTotals()
  const daily = await flushDaily()
  return NextResponse.json({ flushedTotals: totals, flushedDaily: daily })
}
