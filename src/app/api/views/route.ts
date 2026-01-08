export const runtime = "edge"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { kv } from "@vercel/kv"

// Fallback in-memory store for local dev when KV env vars are not set
const memory = (globalThis as any).__viewCounterMemory || new Map<string, number>()
;(globalThis as any).__viewCounterMemory = memory

const hasKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

function keyFrom(ns?: string | null, id?: string | null, path?: string | null): string {
  if (ns && id) return `views:${ns}:${id}`
  if (path) return `views:path:${path}`
  throw new Error("Missing ns/id or path for views key")
}

const getSchema = z.object({
  ns: z.string().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
})

const postSchema = z.object({
  ns: z.string().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
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
  try {
    const { searchParams, pathname } = new URL(req.url)
    const parsed = getSchema.safeParse({
      ns: searchParams.get("ns") || undefined,
      id: searchParams.get("id") || undefined,
      key: searchParams.get("key") || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }
    const { ns, id, key } = parsed.data
    const resolvedKey = key || keyFrom(ns ?? null, id ?? null, pathname)
    const count = await kvGet(resolvedKey)
    return NextResponse.json({ key: resolvedKey, count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
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
    const resolvedKey = key || keyFrom(ns ?? null, id ?? null, req.nextUrl.pathname)
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
