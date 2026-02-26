export const runtime = "edge"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { kv } from "@vercel/kv"
import { checkRateLimit } from "@/lib/rate-limit"
import { isTemporaryEnvPlaceholder } from "@/lib/env-placeholders"

// Fallback in-memory store for local dev when KV env vars are not set
const memory = (globalThis as any).__viewCounterMemory || new Map<string, number>()
;(globalThis as any).__viewCounterMemory = memory

const hasKV = Boolean(
  process.env.KV_REST_API_URL
  && process.env.KV_REST_API_TOKEN
  && !isTemporaryEnvPlaceholder(process.env.KV_REST_API_URL)
  && !isTemporaryEnvPlaceholder(process.env.KV_REST_API_TOKEN)
)
const KEY_MAX_LENGTH = 300
const NAMESPACE_REGEX = /^[a-z0-9_-]{1,32}$/i
const ENTITY_ID_REGEX = /^[a-zA-Z0-9:_-]{1,128}$/
const PATH_REGEX = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]{0,255}$/
const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_READ_PER_MINUTE = 240
const RATE_LIMIT_WRITE_PER_MINUTE = 120
// Stricter limits for clients whose IP cannot be resolved (shared "unknown" bucket)
const RATE_LIMIT_READ_UNKNOWN_PER_MINUTE = 30
const RATE_LIMIT_WRITE_UNKNOWN_PER_MINUTE = 10

function normalizePath(path: string): string | null {
  if (!PATH_REGEX.test(path)) {
    return null
  }
  return path
}

function normalizeViewKey(key: string): string | null {
  const normalized = key.trim()
  if (!normalized.startsWith("views:") || normalized.length > KEY_MAX_LENGTH) {
    return null
  }

  const pathPrefix = "views:path:"
  if (normalized.startsWith(pathPrefix)) {
    const path = normalizePath(normalized.slice(pathPrefix.length))
    return path ? `${pathPrefix}${path}` : null
  }

  const keyMatch = normalized.match(/^views:([^:]+):(.+)$/)
  if (!keyMatch) return null

  const [, ns, id] = keyMatch
  if (!NAMESPACE_REGEX.test(ns) || !ENTITY_ID_REGEX.test(id)) {
    return null
  }

  return `views:${ns}:${id}`
}

function resolveViewKey(ns?: string | null, id?: string | null, key?: string | null): string {
  if (key) {
    const normalized = normalizeViewKey(key)
    if (!normalized) {
      throw new Error("Invalid views key format")
    }
    return normalized
  }

  if (!ns || !id) {
    throw new Error("Missing key or ns/id")
  }

  if (!NAMESPACE_REGEX.test(ns) || !ENTITY_ID_REGEX.test(id)) {
    throw new Error("Invalid namespace or entity ID")
  }

  return `views:${ns}:${id}`
}

function getClientIdentifier(req: NextRequest): string {
  const xRealIp = req.headers.get("x-real-ip")
  if (xRealIp) {
    return xRealIp.replace(/[\x00-\x1f\x7f]/g, "")
  }

  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim()
    if (first) {
      return first.replace(/[\x00-\x1f\x7f]/g, "")
    }
  }

  return "unknown"
}

function rateLimitResponse(resetIn: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(1, Math.floor(resetIn)).toString(),
      },
    }
  )
}

async function enforceRateLimit(req: NextRequest, mode: "read" | "write"): Promise<NextResponse | null> {
  const clientId = getClientIdentifier(req)
  // Unknown clients (no resolvable IP) share a single bucket — apply much stricter
  // limits so one unidentified client cannot exhaust capacity for everyone else.
  const isUnknown = clientId === "unknown"
  const limit = mode === "write"
    ? (isUnknown ? RATE_LIMIT_WRITE_UNKNOWN_PER_MINUTE : RATE_LIMIT_WRITE_PER_MINUTE)
    : (isUnknown ? RATE_LIMIT_READ_UNKNOWN_PER_MINUTE : RATE_LIMIT_READ_PER_MINUTE)
  const result = await checkRateLimit(
    `views:${mode}:${clientId}`,
    limit,
    RATE_LIMIT_WINDOW_SECONDS
  )

  if (!result.success) {
    return rateLimitResponse(result.resetIn)
  }

  return null
}

const getSchema = z.object({
  ns: z.string().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.key && !(data.ns && data.id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide key or ns/id",
    })
  }
})

const postSchema = z.object({
  ns: z.string().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.key && !(data.ns && data.id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide key or ns/id",
    })
  }
})

async function kvGet(key: string): Promise<number> {
  if (hasKV) {
    const val = await kv.get<number>(key)
    return typeof val === "number" ? val : Number(val || 0)
  }
  return memory.get(key) || 0
}

async function kvIncr(key: string): Promise<number> {
  if (hasKV) {
    return await kv.incr(key)
  }
  const next = (memory.get(key) || 0) + 1
  memory.set(key, next)
  return next
}

export async function GET(req: NextRequest) {
  const rateLimited = await enforceRateLimit(req, "read")
  if (rateLimited) {
    return rateLimited
  }

  try {
    const { searchParams } = new URL(req.url)
    const parsed = getSchema.safeParse({
      ns: searchParams.get("ns") || undefined,
      id: searchParams.get("id") || undefined,
      key: searchParams.get("key") || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }
    const { ns, id, key } = parsed.data
    const resolvedKey = resolveViewKey(ns ?? null, id ?? null, key ?? null)
    const count = await kvGet(resolvedKey)
    return NextResponse.json({ key: resolvedKey, count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await enforceRateLimit(req, "write")
  if (rateLimited) {
    return rateLimited
  }

  try {
    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    const { ns, id, key } = parsed.data
    const resolvedKey = resolveViewKey(ns ?? null, id ?? null, key ?? null)
    const count = await kvIncr(resolvedKey)

    // Mark key dirty for consolidation and maintain daily buckets
    try {
      const today = new Date().toISOString().slice(0, 10)
      const dayKey = `views:daily:${today}:${resolvedKey}`
      if (hasKV) {
        await Promise.all([
          kv.sadd("views:dirty", resolvedKey),
          kv.incr(dayKey),
          kv.sadd(`views:dirty:daily:${today}`, dayKey),
          kv.sadd("views:dirty:daily-index", today),
        ])
      } else {
        // In-memory fallback
        const dirty: Set<string> = (globalThis as any).__dirtyKeys || new Set()
        dirty.add(resolvedKey)
        ;(globalThis as any).__dirtyKeys = dirty
        memory.set(dayKey, (memory.get(dayKey) || 0) + 1)
      }
    } catch (error) {
      console.error("Failed to mark view keys dirty:", error)
    }
    return NextResponse.json({ key: resolvedKey, count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
